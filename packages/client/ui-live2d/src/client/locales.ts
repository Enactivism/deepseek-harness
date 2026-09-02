/** Live2D companion dictionaries. */

/** Simplified Chinese dictionary — the key-set source of truth. */
export const zh = {
  'brand': 'Live2D 陪伴',
  'subtitle': '陪你写代码',
  'status.empty': '等待模型',
  'status.loading': '模型加载中 · {percent}%',
  'status.ready': '已就绪',
  'status.thinking': '正在陪你思考',
  'status.error': '模型加载失败',
  'empty.title': '上传你的模型',
  'empty.description': '选择包含 .model3.json 或 .model.json 的模型文件夹',
  'empty.local': '模型只在当前页面本地加载，不会上传到远端',
  'action.upload': '上传模型文件夹',
  'action.change': '更换模型',
  'action.clear': '移除模型',
  'action.hide': '隐藏 Live2D 陪伴',
  'action.show': '显示 Live2D 陪伴',
  'action.openControls': '调整外观',
  'action.closeControls': '收起调整',
  'action.desktopPet': '桌宠模式',
  'action.exitDesktopPet': '退出桌宠',
  'controls.title': '外观调整',
  'controls.scale': '模型大小',
  'controls.opacity': '透明度',
  'model.files': '{count} 个文件',
  'model.loading': '正在读取 {name}',
  'error.noFiles': '没有读取到模型文件，请重新选择文件夹。',
  'error.missingEntry': '没有找到 .model3.json 或 .model.json 入口文件。',
  'error.multipleEntries': '文件夹中有多个模型入口，请只选择一个模型文件夹。',
  'error.missingData': '没有找到 .moc3 或 .moc 模型数据文件。',
  'error.invalidModel': '模型入口文件不是有效的 JSON。',
  'error.runtime': 'Live2D 运行时初始化失败，请检查模型文件是否完整。',
  'error.storage': '模型保存失败，请稍后重试。',
} satisfies Record<string, string>

/** Live2D dictionary key union. */
export type Live2DKey = keyof typeof zh

/** English dictionary, checked complete against the Chinese source. */
export const en = {
  'brand': 'Live2D companion',
  'subtitle': 'Coding with you',
  'status.empty': 'Waiting for a model',
  'status.loading': 'Loading model · {percent}%',
  'status.ready': 'Ready',
  'status.thinking': 'Thinking with you',
  'status.error': 'Model failed to load',
  'empty.title': 'Upload your model',
  'empty.description': 'Choose a folder containing .model3.json or .model.json',
  'empty.local': 'The model stays in this page and is never uploaded',
  'action.upload': 'Upload model folder',
  'action.change': 'Change model',
  'action.clear': 'Remove model',
  'action.hide': 'Hide Live2D companion',
  'action.show': 'Show Live2D companion',
  'action.openControls': 'Adjust appearance',
  'action.closeControls': 'Hide adjustments',
  'action.desktopPet': 'Desktop pet',
  'action.exitDesktopPet': 'Exit desktop pet',
  'controls.title': 'Appearance',
  'controls.scale': 'Model size',
  'controls.opacity': 'Opacity',
  'model.files': '{count} files',
  'model.loading': 'Reading {name}',
  'error.noFiles': 'No model files were selected. Choose the folder again.',
  'error.missingEntry': 'No .model3.json or .model.json entry file was found.',
  'error.multipleEntries': 'Multiple model entries were found. Choose one model folder.',
  'error.missingData': 'No .moc3 or .moc model data file was found.',
  'error.invalidModel': 'The model entry is not valid JSON.',
  'error.runtime': 'Live2D runtime initialization failed. Check that the model is complete.',
  'error.storage': 'The model could not be saved. Try again.',
} satisfies Record<Live2DKey, string>

/** Namespace used by the slot's locale seat. */
export const NS = 'live2d'
