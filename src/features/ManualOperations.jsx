const manualShortcutLabel = keys => keys[0]?.replace(/^((?:[^+]+\+)*)Cmd\+/, 'Command+$1').replace(/\+(?=.)/g, ' ');

export default function ManualOperations({ shortcuts }) {
  return <>
    <section>
      <h3>基础操作</h3>
      <ul>
        <li><strong>☰ 切换界面</strong></li>
        <li><strong>× 返回书房</strong></li>
        <li><strong><kbd>Esc</kbd> 返回上一级</strong></li>
      </ul>
    </section>
    <section>
      <h3><kbd>{manualShortcutLabel(shortcuts.search) ?? '未设置'}</kbd> 搜索与筛选〔实体〕</h3>
      <ul>
        <li>在任何页面，{manualShortcutLabel(shortcuts.search)
          ? <>按 <kbd>{manualShortcutLabel(shortcuts.search)}</kbd> 打开/关闭顶部检索框。</>
          : '先在“快捷键设置”中设键，就可以用该快捷键开关顶部检索框。'}</li>
        <li>在检索框输入文字，或点击右侧的筛选图标，设置检索规则。</li>
        <li>检索规则即时应用，当前页面只显示符合规则的〔实体〕。</li>
      </ul>
    </section>
    <section>
      <h3><kbd>{manualShortcutLabel(shortcuts.createContent) ?? '未设置'}</kbd> 新建〔实体〕</h3>
      <ul>
        <li>在功能区内，{manualShortcutLabel(shortcuts.createContent)
          ? <>按 <kbd>{manualShortcutLabel(shortcuts.createContent)}</kbd> 添加〔实体〕。</>
          : '在“快捷键设置”中设键后，按该键添加〔实体〕。'}</li>
      </ul>
    </section>
    <section>
      <h3><span className="manual-mouse-control">鼠标双击</span> 编辑〔实体〕</h3>
      <ul>
        <li><span className="manual-mouse-control">鼠标双击</span> 任何〔实体〕，对它的字段进行编辑。</li>
      </ul>
    </section>
    <section>
      <h3><span className="manual-mouse-control">鼠标右击</span> 给〔实体〕添加关联</h3>
      <ul>
        <li><span className="manual-mouse-control">鼠标右击</span> 任何〔实体〕，查看/{manualShortcutLabel(shortcuts.createContent)
          ? <kbd>{manualShortcutLabel(shortcuts.createContent)}</kbd>
          : '新建'}与其他〔实体〕的关联。</li>
      </ul>
    </section>
    <section>
      <h3><kbd>{manualShortcutLabel(shortcuts.showOnGlobe) ?? '未设置'}</kbd> 进入地球仪并显示〔记忆点〕</h3>
      <ul>
        <li>在任何页面，{manualShortcutLabel(shortcuts.showOnGlobe)
          ? <>按 <kbd>{manualShortcutLabel(shortcuts.showOnGlobe)}</kbd></>
          : '在“快捷键设置”中设键后按该键'} 进入地球仪，显示当前页面的所有〔记忆点〕及其他类型〔实体〕关联的〔记忆点〕。</li>
      </ul>
    </section>
    <section>
      <h3><kbd>{manualShortcutLabel(shortcuts.snapshot) ?? '未设置'}</kbd> 保存〔实体〕快照</h3>
      <ul>
        <li>在任何页面，{manualShortcutLabel(shortcuts.snapshot)
          ? <>按 <kbd>{manualShortcutLabel(shortcuts.snapshot)}</kbd>，</>
          : '在“快捷键设置”中设键后按该键，'}将当前页面的所有〔实体〕保存为一个 Markdown 文件。</li>
      </ul>
    </section>
  </>;
}
