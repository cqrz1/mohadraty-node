const express = require('express');
const studentController = require('../controllers/student.controller');
const { studentAuth } = require('../middlewares/auth');

const router = express.Router();

router.get('/login', studentController.getLogin);
router.post('/login', studentController.postLogin);

router.get('/dashboard', studentAuth, studentController.getDashboard);
router.post('/professor/select', studentAuth, studentController.postSelectProfessor);
router.get('/professor', studentAuth, studentController.getProfessor);
router.get('/lectures', studentAuth, studentController.getLectures);
router.get('/sheets', studentAuth, studentController.getSheets);
router.get('/logout', studentAuth, studentController.logout);

module.exports = router;