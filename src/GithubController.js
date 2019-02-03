const Promise = require('bluebird');
const _ = require('lodash');
const GitHubApi = require("github");


// application modules
const eventBus = require('../../../tools/eventBus');
const logger = require('../../../tools/logger');

class GithubController {
  constructor(config) {
    this._config = config;
    this._hookEvents = [
      'push', 'issue', 'status',
      'watch', 'fork', 'pull_request',
      'release'];
    this._hooks = [];
  }
  login() {
    this.github = new GitHubApi({
        // required
        //version: "3.0.0",
        // optional
        Promise: Promise,
        //debug: true,
        timeout: 5000,
    });

    const type = "oauth";
    const key =  this._config.clientID;
    const secret = this._config.clientSecret;
    return this.github.authenticate({type, key, secret});
  }
  getWebhooks(req, res) {
      res.json(this._hooks);
  }
  ioConnection(socket) {
    logger.info('github: io connection made.');
    socket.emit('test', 'hello client');
    socket.on('hello', function (data) {
      logger.info(data);
    });
    socket.broadcast.emit('test', 'broadcast msg!');
    socket.emit('test', 'hello-world');
  }
  get hookUrl() {
    return this.config.url+"/github/webhook/hook";
  }
  createWebhook(req, res) {
      if( !this.config.url ) {
          return res
          .status(404)
          .json({error: 'url not configured!'});
      }
      logger.silly('github:', req.body);
      if(!req.body.user || !req.body.repo){
          return res.status(403).json({error: 'missing user/repo'});
      }
      this.github.repos.createHook( {
              owner: req.body.owner,
              repo: req.body.repo,
              name: 'opentmi',
              config: {
                  "url": this.hookUrl,
                  "content_type": "json"
              },
              event: this.hookEvents,
              active: true
      }).then( resp => {
        let data = resp.data;
        hooks.push(data);
        res.json(data);
      }).catch(error => {
        logger.error(error);
        res.status(500).json(data);
      });
  }

  getModuleJson(req, res){
    this._readYottaModuleJson(
      req.params.user,
      req.params.repo,
      _.get(req.query, 'ref', 'master')
    ).then(data => res.json(data)).timeout(10000)
    .catch( error => {
      logger.error(error);
      res.status(_.get(error, 'code', 500)).json(error);
    });
  }

  _readYottaModuleJson(owner, repo, ref='master', path='/module.json'){
    const payload = {owner, repo, path, ref};
    logger.debug("reading yotta module.json from github...", payload);
    return this.github.repos
    .getContent(payload)
    .then(resp => {
      let data = resp.data;
      let decoded;
      try{
        let content = new Buffer(data.content, 'base64').toString("ascii");
        decoded = JSON.parse(content);
      } catch(error){
        logger.silly(error);
        logger.error(`Repo: ${repo} didnt contains valid module.json`);
        return Promise.reject(error);
      }
      return decoded;
    });
  }

  _sendGuiNotifyFromGithubHook(data) {
      let getUrl = (text, url) => {
          return `<a href="${url||data.repository.url}">${text||data.repository.full_name}</a>`
      }
      let noty = {text: 'github hook', delay: 4000}
      try {
          if( data.ref == 'refs/heads/master' && data.before && data.after ) {
            noty.text = 'New commit received to '+getUrl(null, data.head_commit.url);
          } else if( data.action === 'opened' && data.pull_request ){
              noty.text = 'New '+getUrl(data.repository.full_name+":PR#"+data.pull_request.number, data.pull_request.html_url)+' created';
          } else if( data.action === 'opened' && data.issue ){
              noty.text = 'New '+getUrl(data.repository.full_name+":issue#"+data.issue.number, data.issue.html_url)+' created';
          } else {
            noty.text = 'github hook '+getUrl();
          }
      } catch(e) {
          noty.text = e;
          noty.type = 'error';
      }
      eventBus.emit('notify', noty);
  }
  webhook(req, res) {
      logger.silly('webhook received from GitHub. Body:', req.body);
      this._sendGuiNotifyFromGithubHook(req.body);
      this.io.emit('github.webhook', req.body);
      eventBus.emit('github.webhook', req.body);
      res.status(200).json({message: 'webhook received by OpenTMI'});
  }

  createStatus(owner, repo, sha, state, target_url='', description='', context='') {
    let allowedStatuses = ['pending', 'success', 'error', 'failure'];
    let status =  {
      owner,
      repo,
      sha,
      state,
      target_url,
      description,
      context
    }
    return this.github.repos.createStatus(status);
  }
  getAllRepos() {
    let repositories = [];
    let per_page = 10;
    let limit = 10;
    logger.silly("getAllRepos..", this.config.organization);

    let fetchPage = (page=0) => {
      logger.error("fetchPage: ", page);
      return this.github.repos.getAll({
          page: page,
          per_page: per_page
        }).then(resp => {
          let repos = resp.data;
          logger.debug(`got ${repos.length} repo`);
          return processPage({repos, page});
        });
    }
    let processPage = ({repos, page}) => {
      logger.debug('processPage', repos, page);
      repositories = repositories.concat( repos );
      logger.silly(repositories.length)
      let enough = limit>0?repositories.length>=limit:false;
      if( repos.length === per_page && !enough){
        return fetchPage(page+1);
      }
      return Promise.resolve(repositories);
    }
    return fetchPage();
  }
  lookupOrg() {
    let params = {org: this.config.organization};
    this.github.orgs.get(params)
    .then( res => {
      let publicRepos = res.data.public_repos;
      let privateRepos = _.get(res.data, 'total_private_repos', 0);
      let githubStatus = {
          total_repos: ( publicRepos + privateRepos),
          public_repos: publicRepos,
          private_repos: privateRepos,
          disk_usage: _.get(res.data, 'disk_usage')
      }
      logger.silly("lookupOrg: "+JSON.stringify(githubStatus));
      eventBus.emit('status.now', {
        github: githubStatus
      });
    }).catch( error => {
      logger.error(error);
    });
  }

  yotta(req, res){
    this.getAllRepos()
    .then(resp => {
      let repos = resp.data;
      let repoNames = _.map(repos, function(data){
        return {user: this.config.organization, name: data.name} ;
      });
      logger.silly(repoNames);
      let filter = data => {
        logger.debug('fetch module json if exists..');
        return this._readYottaModuleJson(data.user, data.name);
      }
      Promise
      .map(repoNames, filter)
      .catch(error => {
        res.status(500).json(error);
      }).then( data => {
        let out =  _.filter(data, obj => obj);
        res.json(out);
      });
    })
    .catch( error => {
      logger.error(error);
      res.status(404).json(error);
    });
  }

  status() {
    let status = {
      public_repos: 0,
      private_repos: 0,
      total_repos: 0,
      disk_usage: 0
    }
    eventBus.emit('status.now.init', {github: status});
  }
}

module.exports = GithubController;
