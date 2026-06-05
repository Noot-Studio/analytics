/** Check if content looks like a full page (not a component/partial) */
function isFullPage(content) {
  const stripped = content.replaceAll(/<!--[\s\S]*?-->/g, "");
  return /<!doctype\s|<html[\s>]|<head[\s>]/i.test(stripped);
}

export { isFullPage };
