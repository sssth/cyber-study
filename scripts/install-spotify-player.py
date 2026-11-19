#!/usr/bin/env python3
"""Install a verified go-librespot runtime for this Mac without Homebrew."""
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
from urllib.request import Request, urlopen

BOTTLES = {
    "go-librespot": ("0.10.7", "9c44f9814a81bf068b70220989f89f45a1fd97d314884f55490076e27e022a27"),
    "flac": ("1.5.0", "82b19ded7c732c245a9e325c191de60f7d17bb3370afdc98d159852cf3f9dbd5"),
    "libogg": ("1.3.6", "4d9d14f8e36ed913c02201bfc01682ba3f550de412e9a24e3ef9aed4f1b8a23d"),
    "libvorbis": ("1.3.7", "99c0de7ff87f4648bb17acd0324a15563e975b7492dbd4f11fd656a8eb6b5622"),
    "mpg123": ("1.33.7", "5fcd87caeb9b6e6730d7de5c7738e785c84814c641d1ba9ac578a142d2b033f5"),
}
FILES = {
    "go-librespot": ["bin/go-librespot", "LICENSE"],
    "flac": ["lib/libFLAC.14.dylib"],
    "libogg": ["lib/libogg.0.8.6.dylib"],
    "libvorbis": ["lib/libvorbisenc.2.dylib", "lib/libvorbis.0.dylib"],
    "mpg123": ["lib/libmpg123.0.dylib"],
}


def download(url, token=None):
    headers = {"User-Agent": "Cyber-Study Spotify runtime"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    with urlopen(Request(url, headers=headers), timeout=30) as response:
        return response.read()


def install(destination, archives):
    if platform.system() != "Darwin" or platform.machine() != "arm64" or int(platform.mac_ver()[0].split(".")[0]) < 26:
        raise RuntimeError("此安装脚本适用于 macOS 26 的 Apple Silicon，可在其他平台自行安装兼容版本。")
    if destination.exists():
        print(f"Spotify 播放组件目录已存在：{destination}")
        return
    with tempfile.TemporaryDirectory(prefix="study-spotify-") as temporary:
        temp = Path(temporary)
        runtime = temp / "runtime"
        runtime.mkdir(mode=0o700)
        for name, (version, digest) in BOTTLES.items():
            archive = archives / f"{name}.tar.gz" if archives else temp / f"{name}.tar.gz"
            if not archives:
                repository = f"homebrew/core/{name}"
                token = json.loads(download(f"https://ghcr.io/token?service=ghcr.io&scope=repository:{repository}:pull"))["token"]
                archive.write_bytes(download(f"https://ghcr.io/v2/{repository}/blobs/sha256:{digest}", token))
            if hashlib.sha256(archive.read_bytes()).hexdigest() != digest:
                raise RuntimeError(f"{name} 校验失败。")
            with tarfile.open(archive) as bottle:
                for name_in_archive in FILES[name]:
                    member = f"{name}/{version}/{name_in_archive}"
                    source = bottle.extractfile(member)
                    if source is None:
                        raise RuntimeError(f"缺少 {member}。")
                    filename = Path(name_in_archive).name
                    if filename == "libogg.0.8.6.dylib":
                        filename = "libogg.0.dylib"
                    with source, (runtime / filename).open("wb") as target:
                        shutil.copyfileobj(source, target)
        executable = runtime / "go-librespot"
        executable.chmod(0o700)
        for file in [*runtime.glob("*.dylib"), executable]:
            dependencies = subprocess.check_output(["otool", "-L", str(file)], text=True).splitlines()[1:]
            for line in dependencies:
                old = line.strip().split(" (compatibility", 1)[0]
                basename = Path(old).name
                if not old.startswith(("@@HOMEBREW_PREFIX@@/", "@@HOMEBREW_CELLAR@@/")):
                    continue
                if not (runtime / basename).is_file():
                    raise RuntimeError(f"缺少运行库 {basename}。")
                flag = ["-id", f"@loader_path/{basename}"] if basename == file.name else ["-change", old, f"@loader_path/{basename}"]
                subprocess.run(["install_name_tool", *flag, str(file)], check=True, capture_output=True)
            subprocess.run(["codesign", "--force", "--sign", "-", str(file)], check=True, capture_output=True)
        subprocess.run([str(executable), "--help"], stdout=subprocess.DEVNULL, check=True)
        os.rename(runtime, destination)
    print(f"已安装 Spotify 播放组件：{destination}")


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    install(root / ".spotify.local", Path(sys.argv[1]) if len(sys.argv) > 1 else None)
