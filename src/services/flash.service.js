function setFlash(req, message, type) {
  req.session.flash = { message, type: type || 'info' };
}

function getFlash(req) {
  const flash = req.session.flash || null;
  delete req.session.flash;
  return flash;
}

module.exports = {
  setFlash,
  getFlash
};