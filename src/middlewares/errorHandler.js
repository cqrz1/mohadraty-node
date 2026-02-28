function notFoundHandler(req, res) {
  const isAdminPath = req.originalUrl.startsWith('/admin');

  return res.status(404).render('error', {
    title: 'صفحة غير موجودة',
    message: 'الصفحة المطلوبة غير موجودة.',
    backUrl: isAdminPath ? '/admin' : '/dashboard'
  });
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const isExpected = statusCode >= 400 && statusCode < 500;
  const isAdminPath = req.originalUrl.startsWith('/admin');

  if (!isExpected) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  if (res.headersSent) {
    return next(err);
  }

  return res.status(statusCode).render('error', {
    title: 'خطأ في النظام',
    message: err.message || 'حدث خطأ غير متوقع.',
    backUrl: isAdminPath ? '/admin' : '/dashboard'
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
