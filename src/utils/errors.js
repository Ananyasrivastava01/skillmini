export function apiError(code, message, extras = {}) {
  const err = new Error(message || code);
  err.expose = true;
  err.status = codeToStatus(code);
  err.payload = { error: { code, message, ...extras } };
  return err;
}

export function errorHandler(err, req, res, next) {
  if (err && err.expose && err.payload) {
    res.status(err.status || 400).json(err.payload);
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } });
}

function codeToStatus(code) {
  switch (code) {
    case 'FIELD_REQUIRED':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
      return 409;
    default:
      return 400;
  }
}


