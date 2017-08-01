const Promise = require('bluebird');
const nconf = require('../../../../config');
const express = require('express');
const GitHubApi = require("github");

const logger = require('../../../tools/logger');
const GithubController = require('./GithubController');


class AddonGithub extends GithubController {
  constructor(app, server, io) {
    super();
    // Defined variables
    this.config = nconf.get('github');

    // Own variables
    this.router = express.Router();
    this.app = app;
    this.server = server;
    this.io = io;
  }

  // Default implementation of register
  register() {
    if (!this.config ||
      !this.config.clientID ||
      !this.config.clientSecret ) {
      logger.error('github not configured');
      return Promise.reject("Github not configured");
    }

    this.login();

    /*
    let dummyReq = {
      params: {
        user: 'ARMmbed',
        repo: 'mbed-trace'
      }
    }
    let dummyRes = {
      status(){return this;},
      json(){}
    };
    this.yotta(dummyReq, dummyRes);*/
    logger.warn('registering instance of sample class');
    this.router.get('/github', (req, res) => { res.json({msg: 'test'});})
    this.router.get('/github/webhook', this.getWebhooks.bind(this));
    this.router.post('/github/webhook', this.createWebhook.bind(this));
    this.router.post('/github/event', this.webhook.bind(this))
    this.router.get('/yotta', this.yotta.bind(this))
    this.router.get('/yotta/:user/:repo', this.getModuleJson.bind(this));
    // attach router
    this.app.use('/', this.router);
    this.io.on('connection', super.ioConnection);
  }

  unregister() {
    logger.warn('unregistering github... not implemented');
    return Promise.reject("Not implemented");
  }
}

module.exports = AddonGithub;
