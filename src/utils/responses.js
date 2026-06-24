function errorResponse(res, statusCode, message) {
  return res.status(statusCode).json({
    status: 'error',
    message
  });
}

function successResponse(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    status: 'success',
    data
  });
}

module.exports = {
  errorResponse,
  successResponse
};
