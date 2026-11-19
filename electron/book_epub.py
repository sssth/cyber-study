import base64
import json
from html.entities import name2codepoint
import posixpath
import re
import sys
import xml.etree.ElementTree as ET
from urllib.parse import unquote, urlsplit
from zipfile import BadZipFile, ZipFile


def tag(node):
    return node.tag.rsplit('}', 1)[-1]


def text(node):
    return ' '.join(''.join(node.itertext()).split())


def target(document, href):
    url = urlsplit(href)
    if url.scheme or url.netloc:
        return None
    name = posixpath.normpath(posixpath.join(posixpath.dirname(document), unquote(url.path))) if url.path else document
    return name, unquote(url.fragment)


def read_xml(archive, name):
    member = archive.getinfo(name)
    if member.file_size > 16 * 1024 * 1024:
        raise ValueError('EPUB 单个章节或目录过大。')
    data = archive.read(member)
    if re.search(br'<!ENTITY\s', data.replace(b'\x00', b''), re.I):
        raise ValueError('EPUB 包含不支持的 XML 实体。')
    def expand_entity(match):
        codepoint = name2codepoint.get(match[1].decode('ascii'))
        return f'&#{codepoint};'.encode('ascii') if codepoint else match[0]

    return ET.fromstring(re.sub(br'&([A-Za-z][A-Za-z0-9]+);', expand_entity, data))


def contents(archive, manifest, spine):
    candidates = [(name, 'nav') for name, _, props in manifest.values() if 'nav' in props]
    candidates += [(name, 'ncx') for name, mime, _ in manifest.values() if mime == 'application/x-dtbncx+xml']
    for name, kind in candidates:
        try:
            root = read_xml(archive, name)
        except (KeyError, ET.ParseError):
            continue
        result = {}

        def visit(node, depth=0):
            kind_tag = tag(node)
            if kind == 'ncx' and kind_tag == 'navPoint':
                label = next((text(n) for n in node if tag(n) == 'navLabel'), '')
                href = next((n.get('src') for n in node if tag(n) == 'content'), None)
            elif kind == 'nav' and kind_tag == 'li':
                link = next((n for n in node if tag(n) == 'a'), None)
                label, href = (text(link), link.get('href')) if link is not None else ('', None)
            else:
                label, href = '', None
            location = target(name, href) if href else None
            if location and location[0] in spine and label:
                result.setdefault(location, (label, depth))
                depth += 1
            for child in node:
                visit(child, depth)

        if kind == 'nav':
            root = next((n for n in root.iter() if tag(n) == 'nav' and
                         'toc' in n.get('{http://www.idpf.org/2007/ops}type', '').split()), None)
        else:
            root = next((n for n in root.iter() if tag(n) == 'navMap'), None)
        if root is not None:
            visit(root)
        if result:
            return result
    return {}


def render_document(root, headings, fallback):
    body = next((node for node in root.iter() if tag(node) == 'body'), root)
    seen = set()
    levels = [int(tag(node)[1]) for node in body.iter() if re.fullmatch(r'h[1-6]', tag(node))]
    first_level = min(levels, default=1)

    def inline(value):
        return re.sub(r'[\t\n\r ]+', ' ', value or '')

    def heading(label, level):
        return '\n\n' + '#' * min(level, 6) + ' ' + label + '\n\n'

    def anchor_of(node):
        return node.get('id') or node.get('{http://www.w3.org/XML/1998/namespace}id') or node.get('name')

    def render(node):
        kind = tag(node)
        if kind in {'script', 'style', 'svg', 'nav', 'head'}:
            return ''
        is_heading = re.fullmatch(r'h[1-6]', kind)
        anchor = anchor_of(node)
        if is_heading and anchor not in headings:
            anchor = next((key for child in node.iter() if (key := anchor_of(child)) in headings), anchor)
        entry = headings.get(anchor)
        prefix = ''
        if entry and anchor not in seen:
            seen.add(anchor)
            prefix = heading(entry[0], 2 + entry[1])
        if kind == 'br':
            return '\n'
        if kind == 'img':
            return node.get('alt', '')
        if kind == 'pre':
            return prefix + '\n\n~~~\n' + ''.join(node.itertext()).strip('\n') + '\n~~~\n\n'
        value = inline(node.text) + ''.join(render(child) + inline(child.tail) for child in node)
        if is_heading:
            label = text(node)
            if not label or entry or label in {v[0] for k, v in headings.items() if k in seen or not k}:
                return prefix
            return prefix + heading(label, int(kind[1]) - first_level + (3 if headings else 2))
        if kind == 'li':
            return prefix + '\n- ' + ' '.join(value.split()) + '\n'
        if kind == 'blockquote':
            return prefix + '\n\n' + '\n'.join('> ' + s for s in value.strip().splitlines()) + '\n\n'
        if kind in {'p', 'div', 'section', 'article', 'ul', 'ol', 'table', 'tr', 'figure'}:
            return prefix + '\n\n' + value + '\n\n'
        if kind in {'strong', 'b'} and value.strip() and '\n' not in value.strip():
            return prefix + '**' + value.strip() + '**'
        return prefix + value

    rendered = re.sub(r'\n[ \t]+(?=\n)', '\n', render(body))
    rendered = re.sub(r'\n{3,}', '\n\n', rendered).strip()
    if not rendered:
        return ''
    start = headings.get('')
    if start and not rendered.startswith(heading(start[0], 2 + start[1]).strip() + '\n'):
        return heading(start[0], 2 + start[1]).strip() + '\n\n' + rendered
    if fallback and not seen and not re.search(r'^## ', rendered, re.M):
        return heading(fallback, 2).strip() + '\n\n' + rendered
    return rendered


def extract_cover(archive, metadata, manifest):
    legacy = next((n.get('content') for n in metadata if n.get('name') == 'cover'), None)
    cover = next((item for item in manifest.values() if 'cover-image' in item[2]), manifest.get(legacy))
    if not cover:
        return None
    name, mime, _ = cover
    if mime not in {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}:
        return None
    try:
        member = archive.getinfo(name)
    except KeyError:
        return None
    if member.file_size > 8 * 1024 * 1024:
        return None
    return 'data:' + mime + ';base64,' + base64.b64encode(archive.read(member)).decode('ascii')


def convert(filename):
    with ZipFile(filename) as archive:
        container = read_xml(archive, 'META-INF/container.xml')
        package_name = next(n.attrib['full-path'] for n in container.iter() if tag(n) == 'rootfile')
        package = read_xml(archive, package_name)
        metadata = next(n for n in package if tag(n) == 'metadata')
        manifest = {}
        for node in next(n for n in package if tag(n) == 'manifest'):
            location = target(package_name, node.get('href', ''))
            if location and node.get('id'):
                manifest[node.get('id')] = (location[0], node.get('media-type', ''), node.get('properties', '').split())
        spine = []
        for node in next(n for n in package if tag(n) == 'spine'):
            item = manifest.get(node.get('idref'))
            if item and item[1] in {'application/xhtml+xml', 'text/html'} and 'nav' not in item[2]:
                spine.append(item[0])
        spine = list(dict.fromkeys(spine))
        if sum(archive.getinfo(name).file_size for name in spine) > 48 * 1024 * 1024:
            raise ValueError('EPUB 正文过大。')
        toc = contents(archive, manifest, spine)
        parts = []
        for index, name in enumerate(spine, 1):
            root = read_xml(archive, name)
            headings = {anchor: entry for (document, anchor), entry in toc.items() if document == name}
            document_title = next((text(n) for n in root.iter() if tag(n) == 'title'), '')
            part = render_document(root, headings, (document_title or f'第 {index} 节') if len(spine) > 1 else '')
            if part:
                parts.append(part)
        if not parts:
            raise ValueError('EPUB 没有可读取的文字正文。')
        return {
            'title': next((text(n) for n in metadata if tag(n) == 'title' and text(n)), ''),
            'author': '、'.join(dict.fromkeys(text(n) for n in metadata if tag(n) == 'creator' and text(n))),
            'content': '\n\n'.join(parts) + '\n',
            'cover': extract_cover(archive, metadata, manifest),
        }


if __name__ == '__main__':
    try:
        print(json.dumps(convert(sys.argv[1]), ensure_ascii=False))
    except ValueError as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
    except (BadZipFile, ET.ParseError, KeyError, OSError, StopIteration, RuntimeError):
        print('无法读取 EPUB 的章节，文件可能已损坏或受保护。', file=sys.stderr)
        sys.exit(2)
