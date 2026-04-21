/**
 * Validates the request body for POST /api/profiles.
 */
function validateCreateProfile(req, res, next) {
  const { name } = req.body;

  if (name === undefined || name === null || name === '') {
    return res.status(400).json({ status: 'error', message: 'Missing or empty parameter' });
  }

  if (typeof name !== 'string') {
    return res.status(422).json({ status: 'error', message: 'Invalid parameter type' });
  }

  next();
}

module.exports = { validateCreateProfile };
