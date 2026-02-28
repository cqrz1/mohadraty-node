const express = require('express');
const studentController = require('../controllers/student.controller');
const { studentAuth } = require('../middlewares/auth');
const { authRateLimit, csrfProtection, attachCsrfToken } = require('../middlewares/security');

const router = express.Router();

router.get('/login', csrfProtection, attachCsrfToken, studentController.getLogin);
router.post('/login', authRateLimit, csrfProtection, attachCsrfToken, studentController.postLogin);

router.get('/dashboard', studentAuth, csrfProtection, attachCsrfToken, studentController.getDashboard);
router.post('/professor/select', studentAuth, csrfProtection, studentController.postSelectProfessor);
router.get('/professor', studentAuth, csrfProtection, attachCsrfToken, studentController.getProfessor);
router.get('/lectures', studentAuth, csrfProtection, attachCsrfToken, studentController.getLectures);
router.get('/sheets', studentAuth, csrfProtection, attachCsrfToken, studentController.getSheets);
router.get('/logout', studentAuth, studentController.logout);

module.exports = router;
