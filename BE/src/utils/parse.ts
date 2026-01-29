export const parseBoolean = (value?: string) => {
  if (value === undefined) return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
};

export const buildAbsoluteUrl = (baseUrl: string, relativePath: string) => {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const normalizedPath = relativePath.replace(/^\//, "");
  return `${normalizedBase}/${normalizedPath}`;
};
