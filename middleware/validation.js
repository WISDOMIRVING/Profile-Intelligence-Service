/**
 * Validates the request body for POST /api/profiles.
 * Checks that a non-empty string `name` is provided.
 *
 * Returns:
 *   400 - if name is missing or empty
 *   422 - if name is not a string (invalid type)
 */
function validateCreateProfile(req, res, next) {
  const { name } = req.body;

  // Missing name
  if (name === undefined || name === null) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing or empty name'
    });
  }

  // Invalid type (not a string)
  if (typeof name !== 'string') {
    return res.status(422).json({
      status: 'error',
      message: 'Invalid type'
    });
  }

  // Empty after trimming
  if (name.trim() === '') {
    return res.status(400).json({
      status: 'error',
      message: 'Missing or empty name'
    });
  }

  next();
}

module.exports = { validateCreateProfile };
