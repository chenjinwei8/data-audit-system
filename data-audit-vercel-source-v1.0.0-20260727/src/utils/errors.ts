export const getErrorMessage = (error: unknown, fallback = '操作失败') => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; details?: unknown };
    if (value.message) return String(value.message);
    if (value.details) return String(value.details);
  }
  return fallback;
};

export const ensureSuccess = <T extends { error?: unknown }>(result: T) => {
  if (result.error) throw result.error;
  return result;
};

