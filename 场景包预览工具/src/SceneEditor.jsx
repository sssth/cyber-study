import { useEffect, useRef, useState } from 'react';
import { defaultCameraLimits } from '../../src/scenes/packages/cameraConfig.js';

const sceneFields = [
  { key: 'name', label: '场景名称', type: 'text', help: '应用中显示的场景名称。' }
];
const cameraFields = [
  { key: 'position', label: '相机位置', type: 'vector', help: '相机所在的 X、Y、Z 坐标。Y 朝上，默认面向 −Z。' },
  { key: 'fov', label: '视野', type: 'number', help: '单位为度，范围 30–100。数值越大，画面越广。' },
  { key: 'yaw', label: '左右朝向', type: 'number', optional: true, help: '单位为弧度，留空使用默认值 0。' },
  { key: 'pitch', label: '上下朝向', type: 'number', optional: true, help: '单位为弧度，留空使用默认值 −0.08。' }
];
const limitFields = [
  { key: 'yaw', label: '左右环顾范围', type: 'range', help: '单位为弧度。默认 −0.85 至 0.85。' },
  { key: 'pitch', label: '上下环顾范围', type: 'range', help: '单位为弧度。默认 −0.5 至 0.45。' },
  { key: 'fov', label: '滚轮视野范围', type: 'range', help: '单位为度。默认 45–85°，可在 30–100° 内设置。' }
];
const modelFields = [
  { key: 'id', label: '物件 ID', type: 'text' },
  { key: 'feature', label: '点击功能', type: 'text', optional: true },
  { key: 'position', label: '底部中心位置', type: 'vector', help: '按 X、Y、Z 填写。X 左右，Y 高低，Z 前后。设置了承托物时，命中表面后会自动计算实际 Y。' },
  { key: 'rotation', label: '旋转', type: 'vector', help: '绕 X、Y、Z 轴的角度，单位为弧度。默认 [0, 0, 0]，1.57 约等于 90°。' },
  { key: 'width', label: '宽度', type: 'number', help: '物件旋转后的目标宽度，必须大于 0。其他方向等比缩放。' },
  { key: 'file', label: '模型文件', type: 'text', help: '包内 GLB 文件的相对路径，例如 models/desk.glb。' },
  { key: 'support', label: '承托物', type: 'support', help: '可选。指定同一场景里的物件，系统从上往下寻找它的表面。' },
  { key: 'surfaceCeiling', label: '寻找承托面的起始高度', type: 'number', optional: true, help: '从此 Y 高度向下寻找承托面。留空时从 10 开始，可用它选中书架的某一层。' }
];
const axes = ['X', 'Y', 'Z'];

export function FieldReference() {
  return <details className="field-reference">
    <summary>字段速查 <small>物件、相机与场景呈现</small></summary>
    {[
      { name: '场景', fields: sceneFields },
      { name: '相机 camera', fields: cameraFields },
      { name: '相机操作范围 camera.limits', fields: limitFields },
      { name: '物件 models', fields: modelFields }
    ].map(group => <section key={group.name}>
      <h3>{group.name}</h3>
      <dl>{group.fields.map(({ key, label, help }) => <div key={key}>
        <dt><code>{key}</code> {label}</dt><dd>{help}</dd>
      </div>)}</dl>
    </section>)}
    <p className="hint"><code>views</code> 里的 position 是相机位置，target 是镜头对准的落点。灯光、画面和声音按 <code>appearance.themes</code> 下的主题配置。新增配置项可使用「原始 JSON」。</p>
  </details>;
}

function NumberInput({ label, value, onChange }) {
  return <input type="number" step="any" aria-label={label} value={Number.isFinite(value) ? value : ''}
    onChange={event => {
      const value = event.target.valueAsNumber;
      onChange(Number.isFinite(value) ? value : null);
    }} />;
}

function Field({ field, value, onChange, supportOptions = [] }) {
  const { key, label, type, optional } = field;
  const title = <span>{label} <code>{key}</code></span>;
  if (type === 'range') {
    const range = Array.isArray(value) ? value : defaultCameraLimits[key];
    return <fieldset className="vector-field">
      <legend>{title}</legend>
      <div className="vector-inputs range-inputs">{['最小值', '最大值'].map((bound, index) => <label key={bound}>
        <span>{bound}</span>
        <NumberInput label={`${label} ${bound}`} value={range[index]}
          onChange={number => onChange([index === 0 ? number : range[0], index === 1 ? number : range[1]])} />
      </label>)}</div>
    </fieldset>;
  }
  if (type === 'vector') {
    const vector = Array.isArray(value) ? value : key === 'rotation' ? [0, 0, 0] : [];
    return <fieldset className="vector-field">
      <legend>{title}</legend>
      <div className="vector-inputs">{axes.map((axis, index) => <label key={axis}>
        <span>{axis}</span>
        <NumberInput label={`${label} ${axis}`} value={vector[index]}
          onChange={number => onChange(axes.map((_, component) => component === index ? number : vector[component]))} />
      </label>)}</div>
    </fieldset>;
  }
  return <label className="config-field">
    {title}
    {type === 'support' ? <select value={value ?? ''} onChange={event => onChange(event.target.value || undefined)}>
      <option value="">无承托物</option>
      {value && !supportOptions.includes(value) && <option value={value}>{value}</option>}
      {supportOptions.map(id => <option key={id} value={id}>{id}</option>)}
    </select> : type === 'number' ? <NumberInput label={label} value={value}
      onChange={number => onChange(optional && number === null ? undefined : number)} />
      : <input type="text" value={typeof value === 'string' ? value : ''}
        onChange={event => onChange(optional && !event.target.value ? undefined : event.target.value)} />}
  </label>;
}

function Fields({ fields, data, onChange, supportOptions }) {
  return fields.map(field => <Field key={field.key} field={field} value={data[field.key]}
    onChange={value => onChange({ ...data, [field.key]: value })} supportOptions={supportOptions} />);
}

const presentationLabels = {
  id: 'ID', label: '名称', position: '位置', target: '落点', fov: '视野（度）',
  type: '类型', color: '颜色', ground: '地面颜色', intensity: '强度', shadow: '阴影',
  background: '背景色', fog: '雾色', fogDensity: '雾密度', exposure: '曝光',
  lights: '灯光', mix: '环境混音', audioLoop: '循环音轨', gain: '音量', file: '资源文件',
  rain: '雨', hum: '室内底噪', city: '城市声', materials: '材质', hidden: '隐藏物件',
  glows: '发光效果', environment: '环境反射', dimWithRoomLights: '关灯后亮度比例',
  regions: '落雨区域', min: '最小坐标', max: '最大坐标', defaultTheme: '默认主题', nightTheme: '夜间主题'
};

function ConfigGroup({ label, code, children }) {
  const [expanded, setExpanded] = useState(false);
  return <details className="config-section" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>{label} {code && <code>{code}</code>}</summary>
    {expanded && <div className="config-body">{children}</div>}
  </details>;
}

function ConfigValues({ data, onChange }) {
  return Object.entries(data).map(([key, value]) => {
    const label = Array.isArray(data)
      ? value?.label || (value?.type ? `${value.type} · ${Number(key) + 1}` : `第 ${Number(key) + 1} 项`)
      : presentationLabels[key] ?? key;
    const update = next => onChange(Array.isArray(data)
      ? data.map((item, index) => index === Number(key) ? next : item)
      : { ...data, [key]: next });
    const vector = Array.isArray(value) && value.length === 3 && value.every(item => typeof item === 'number' || item === null);
    if (value && typeof value === 'object' && !vector) {
      return <ConfigGroup key={key} label={label} code={Array.isArray(data) ? undefined : key}>
        <ConfigValues data={value} onChange={update} />
      </ConfigGroup>;
    }
    if (typeof value === 'boolean') {
      return <label key={key}><input type="checkbox" checked={value}
        onChange={event => update(event.target.checked)} /> {label} <code>{key}</code></label>;
    }
    const type = vector ? 'vector' : typeof value === 'string' ? 'text' : 'number';
    return <Field key={key} field={{ key, label, type }} value={value} onChange={update} />;
  });
}

function PresentationEditor({ data, update }) {
  const appearance = data.appearance;
  const themes = Object.entries(appearance?.themes ?? {});
  const updateTheme = (id, theme) => update({
    ...data, appearance: { ...appearance, themes: { ...appearance.themes, [id]: theme } }
  });
  return <>
    {[
      ['views', '机位与落点'],
      ['outdoorRain', '窗外雨'],
      ['hotspots', '交互热点'],
      ['roam', '漫游范围']
    ].map(([key, label]) => data[key] && <ConfigGroup key={key} label={label} code={key}>
      <ConfigValues data={data[key]} onChange={value => update({ ...data, [key]: value })} />
    </ConfigGroup>)}
    {themes.length > 0 && <>
      <ConfigGroup label="灯光与画面" code="appearance">
        <ConfigValues data={{ defaultTheme: appearance.defaultTheme, ...(appearance.nightTheme && { nightTheme: appearance.nightTheme }) }}
          onChange={values => update({ ...data, appearance: { ...appearance, ...values } })} />
        {themes.map(([id, theme]) => {
          const { mix, audioLoop, ...visuals } = theme;
          return <ConfigGroup key={id} label={theme.label} code={id}>
            <ConfigValues data={visuals} onChange={values => updateTheme(id, { ...theme, ...values })} />
          </ConfigGroup>;
        })}
      </ConfigGroup>
      <ConfigGroup label="声音">
        {themes.map(([id, theme]) => <ConfigGroup key={id} label={theme.label} code={id}>
          {theme.mix || theme.audioLoop ? <ConfigValues
            data={{ ...(theme.mix && { mix: theme.mix }), ...(theme.audioLoop && { audioLoop: theme.audioLoop }) }}
            onChange={values => updateTheme(id, { ...theme, ...values })} />
            : <p className="hint">此主题使用默认音景。</p>}
        </ConfigGroup>)}
      </ConfigGroup>
    </>}
  </>;
}

function parseStructure(source) {
  try {
    const data = JSON.parse(source);
    if (data && typeof data.camera === 'object' && data.camera && !Array.isArray(data.camera) &&
      Array.isArray(data.models) && data.models.every(model => model && typeof model === 'object' && !Array.isArray(model))) {
      return data;
    }
  } catch {
    // The raw editor can repair incomplete JSON.
  }
  return null;
}

export default function SceneEditor({ source, onChange, mode, setMode, selected, selection, enabled, busy }) {
  const selectedSection = useRef(null);
  const modelList = useRef(null);
  const data = enabled ? parseStructure(source) : null;
  const structured = mode === 'structure' && data !== null;
  const selectedIndex = selected ? data?.models.findIndex(model => model.id === selected) ?? -1 : -1;

  useEffect(() => {
    if (!structured || selectedIndex < 0 || !selectedSection.current) return;
    modelList.current.open = true;
    selectedSection.current.open = true;
    selectedSection.current.scrollIntoView({ block: 'nearest' });
  }, [structured, selectedIndex, selection]);

  function update(next) {
    onChange(JSON.stringify(next, null, 2) + '\n');
  }

  return <>
    <div className="editor-modes" role="group" aria-label="配置编辑方式">
      <button type="button" aria-pressed={structured} disabled={!data} onClick={() => setMode('structure')}>结构化编辑</button>
      <button type="button" aria-pressed={!structured} onClick={() => setMode('raw')}>原始 JSON</button>
    </div>
    {structured ? <fieldset className="config-tree" disabled={busy} aria-label="scene.json 配置">
      <details className="config-section" ref={modelList} open>
        <summary>物件 <code>models</code> <small>{data.models.length} 项</small></summary>
        <div className="model-tree">{data.models.map((model, index) => {
          const isSelected = index === selectedIndex;
          return <details key={index} ref={isSelected ? selectedSection : null} className={isSelected ? 'model-section selected' : 'model-section'}>
            <summary><span>{typeof model.id === 'string' && model.id ? model.id : `物件 ${index + 1}`}</span></summary>
            <div className="config-body">
              <Fields fields={modelFields} data={model}
                supportOptions={data.models.filter((item, i) => i !== index && typeof item.id === 'string' && item.id).map(item => item.id)}
                onChange={next => update({ ...data, models: data.models.map((item, i) => i === index ? next : item) })} />
            </div>
          </details>;
        })}</div>
      </details>
      <PresentationEditor data={data} update={update} />
      <details className="config-section">
        <summary>场景 <code>name</code></summary>
        <div className="config-body"><Fields fields={sceneFields} data={data} onChange={update} /></div>
      </details>
      <details className="config-section">
        <summary>相机 <code>camera</code></summary>
        <div className="config-body">
          <Fields fields={cameraFields} data={data.camera} onChange={camera => update({ ...data, camera })} />
          <h3 className="range-heading">操作范围 <code>limits</code></h3>
          <Fields fields={limitFields} data={data.camera.limits ?? {}}
            onChange={limits => update({ ...data, camera: { ...data.camera, limits } })} />
        </div>
      </details>
      {data.systemFeatures !== undefined && <details className="config-section">
        <summary>功能对照 <code>systemFeatures</code></summary>
        <pre>{JSON.stringify(data.systemFeatures, null, 2)}</pre>
      </details>}
    </fieldset> : <textarea aria-label="scene.json 原始配置" spellCheck={false} autoCapitalize="off" wrap="off" value={source}
      readOnly={!enabled || busy} placeholder="选择文件夹后显示配置"
      onChange={event => onChange(event.target.value)} />}
  </>;
}
