'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const UserModel = require('../models/user.model');
const { log } = require('../config/logger');

const SALT_ROUNDS = 12;

async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

async function comparePassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

async function signup({ email, password, ip }) {
  const existing = await UserModel.findByEmail(email);
  if (existing) {
    log('warn', 'AUTH_SIGNUP_DUPLICATE', { ip, email, status: 409 });
    const err = new Error('Email already registered');
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await hashPassword(password);
  const user = await UserModel.create({ email, passwordHash });
  const token = signToken(user);
  log('info', 'AUTH_SIGNUP_SUCCESS', { ip, email, user_id: user.id, status: 201 });
  return { user, token };
}

async function login({ email, password, ip }) {
  const user = await UserModel.findByEmail(email);
  if (!user) {
    log('warn', 'AUTH_FAILURE', { ip, email, reason: 'invalid_credentials', status: 401 });
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }

  const valid = await comparePassword(password, user.password_hash);
  if (!valid) {
    log('warn', 'AUTH_FAILURE', { ip, email, reason: 'invalid_credentials', status: 401 });
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }

  const token = signToken(user);
  log('info', 'AUTH_LOGIN_SUCCESS', { ip, email, user_id: user.id, status: 200 });
  return { user: { id: user.id, email: user.email, role: user.role }, token };
}

module.exports = { signup, login };
