// Published players must not see editing controls. Base44 serves editor
// previews under /apps/:id/editor/preview even when the build isn't a Vite
// development bundle; localhost development is explicitly allowed.
export function isGame3DEditorPreview({pathname='',isDev=false}={}) {
  return isDev === true || /\/editor\/preview(?:\/|$)/.test(pathname);
}
