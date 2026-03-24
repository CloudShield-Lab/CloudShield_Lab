'use strict';

const { body } = require('express-validator');
const { validateRequest } = require('../middleware/validateRequest');
const AuthService = require('../services/auth.service');

const signupValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
  validateRequest,
];

// [DEMO] 이메일 형식 검증 의도적 완화 — XSS/SQLi 페이로드가 서비스 계층까지 도달하도록
const loginValidation = [
  body('email').notEmpty().withMessage('Email required'),
  body('password').notEmpty().withMessage('Password required'),
  validateRequest,
];

async function signup(req, res) {
  try {
    const { email, password } = req.body;
    const result = await AuthService.signup({ email, password, ip: req.ip });
    return res.status(201).json({
      token: result.token,
      user: { id: result.user.id, email: result.user.email, role: result.user.role },
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    const result = await AuthService.login({ email, password, ip: req.ip });
    return res.status(200).json({
      token: result.token,
      user: result.user,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

module.exports = { signup, login, signupValidation, loginValidation };
