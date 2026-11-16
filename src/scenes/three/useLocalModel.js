import { useEffect, useState } from 'react';

// 开发与 Electron 打包环境都以相对路径访问 public 资源。
// 先探测模型是否存在；不存在时使用内置低模占位猫，避免构建报错。
export function useLocalModel(url) {
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    let active = true;

    async function checkModel() {
      try {
        const response = await fetch(url, { method: 'HEAD' });
        if (!active) return;
        setStatus(response.ok ? 'ready' : 'missing');
      } catch {
        if (active) setStatus('missing');
      }
    }

    checkModel();
    return () => {
      active = false;
    };
  }, [url]);

  return status;
}
