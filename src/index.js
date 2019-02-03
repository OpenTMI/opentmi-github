// 3rd party modules
const Promise = require('bluebird');
const express = require('express');

// opentmi modules
const {Addon} = require('opentmi-addon');

// application modules
const GithubController = require('./GithubController');


class AddonGithub extends Addon {
  constructor(...args) {
    super(...args);
    // Own variables
    this.controller = new GithubController(this._settings);
    this.router = express.Router();
    this.getWebhooks = this.controller.getWebhooks.bind(this.controller);
    this.createWebhook = this.controller.createWebhook.bind(this.controller);
    this.webhook = this.controller.webhook.bind(this.controller);
    this.yotta = this.controller.yotta.bind(this.controller);
    this.getModuleJson = this.controller.getModuleJson.bind(this.controller);
  }

  // Default implementation of register
  register() {
    if (!this._settings ||
      !this._settings.clientID ||
      !this._settings.clientSecret ) {
      this.logger.error('github not configured');
      return Promise.reject("Github not configured");
    }

    return this.controller.login();

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
    this.logger.warn('registering instance of sample class');
    this.router.get('/github/webhook', this.getWebhooks);
    this.router.post('/github/webhook', this.createWebhook);
    this.router.post('/github/event', this.webhook)
    this.router.get('/yotta', this.yotta)
    this.router.get('/yotta/:user/:repo', this.getModuleJson);
    // attach router
    this.app.use('/', this.router);
    this.io.on('connection', super.ioConnection);
  }

  unregister() {
    this.logger.warn('unregistering github... not implemented');
    return Promise.reject("Not implemented");
  }
}

module.exports = AddonGithub;
