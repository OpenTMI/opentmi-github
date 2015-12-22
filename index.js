var express = require('express');
var GitHubApi = require("github");
var nconf = require('nconf');
var winston = require('winston');
var _ = require('underscore');
var async = require('async');

function AddonGithub (app, server, io, passport){
    var self = this;
    var cfg = nconf.get('github');
    
    this.register = function(){
        
        if( !cfg || !cfg.authentication ) {
          winston.error('github not configured');
          return;
        }
        
        cfg.url = cfg.url || 'http://opentmi/'
        
        global.pubsub.emit('status.now.init', {
            github: {
              public_repos: 0,
              private_repos: 0,
              total_repos: 0,
              disk_usage: 0
            }
        });
        
        var webhookRouter = express.Router();
        var hooks = []
        var getWebhooks = function(req, res) {
            res.json(hooks);
        }
        var createWebhook = function(req, res) {
            if( !cfg.url ) {
                return res.status(404).json({error: 'url not configured!'});
            }
            console.log(req.body);
            if(!req.body.user || !req.body.repo){
                return res.status(403).json({error: 'missing user/repo'});
            }
            self.github.repos.createHook( {
                    user: req.body.user,
                    repo: req.body.repo,
                    name: 'web',
                    config: {
                        "url": cfg.url+"/github/webhoook/hook",
                        "content_type": "json"
                    },
                    event: ['push', 'issue', 'status', 'watch', 'fork', 'pull_request', 'release'],
                    active: true
            }, function(error, data){
                if(error) {
                    console.log(error);
                    res.status(500).json(data);
                    return;
                } 
                hooks.push(data);
                res.json(data);
            });
        }
        
        var sendGuiNotifyFromGithubHook = function(data) {
            console.log(data);
            function getUrl(text, url){
                text = text || data.repository.full_name;
                url = url || data.head_commit.url;
                return '<a href="'+url+'">'+text+'</a>'
            }
            var noty = {text: 'github hook', delay: 4000}
            
            if( data.ref == 'refs/heads/master' && data.before && data.after ) {
              noty.text = 'New commit received to '+getUrl();
            } else if( data.action === 'opened' && data.pull_request ){
                noty.text = 'New '+getUrl(data.repository.full_name+":PR#"+data.pull_request.number, data.pull_request.html_url)+' created';
            } else if( data.action === 'opened' && data.pull_request ){
                noty.text = 'New '+getUrl(data.repository.full_name+":PR#"+data.pull_request.number, data.pull_request.html_url)+' created';
            } else {
              noty.text = 'github hook '+getUrl();
            }
            global.pubsub.emit('notify', noty);
        }
        
        var webhook = function(req, res) {
            console.log('webhook received from GitHub. Body:');
            console.log(req.body);
            sendGuiNotifyFromGithubHook(req.body);
            global.pubsub.emit('github.webhook', req.body);
            res.status(200).json({message: 'webhook received by OpenTMI'});
        }
        webhookRouter.get('/', getWebhooks);
        webhookRouter.post('/', createWebhook);
        webhookRouter.post('/hook', webhook)
        app.use('/github/webhook', webhookRouter);

        app.get('/github/yotta', function(req, res){
          getAllRepos( function(error, repos){
            if(error) return res.status(404).json(error);
            var repoNames = _.map(repos, function(data){
              return {user: cfg.orgId, name: data.name} ;
            });
            console.log(repoNames);
            function filter(data, cb){
              console.log('fetch module json if exists..')
              getModuleJson(data.user, data.name, cb);
            }
            async.map(repoNames, filter, 
              function(error, data){
              if(error)console.log(error);
              data = _.filter( data, function(obj, cb){
                return obj;
              });
              res.json(data);
            });
          });
        });


        function getModuleJson(user, repo, cb){
          var msg = {
            user: user,
            repo: repo,
            path: '/module.json'
          };
          console.log(msg);
          self.github.repos.getContent(msg, 
            function(error, data){
            if(error)return cb();
            try{
              var content = new Buffer(data.content, 'base64').toString("ascii");
              data.decoded = JSON.parse(content);
            } catch(err){
              console.log('Repo: '+repo+' didnt contains valid module.json');
              return cb()
            }
            cb(error, data.decoded);
          })
        }

        app.get('/github/:user/repos/:repo', function(req, res){
          getModuleJson(req.params.user, req.params.repo, 
            function(error, content){
            if(error)res.status(error.code).json(error)
            else res.json(content);
          })
        });

        self.github = new GitHubApi({
            // required 
            version: "3.0.0",
            // optional 
            //debug: true,  
            timeout: 5000,
        });
        self.github.authenticate( cfg.authentication );
        
        function getAllRepos(cb){
          var repositories = [];
          var per_page = 100;
          var limit = 0;

          function fetchPage(page, sub_cb){
            self.github.repos.getAll({
              id: cfg.orgId,
              page: page,
              per_page: per_page,
              }, function(error, repos){
              console.log("got "+repos.length+" repo");
              sub_cb(error, repos, page);
            });
          }
          function processPage(error, repos, page){
            if(error) {
              return cb(error);
            }
            repositories = repositories.concat( repos );
            console.log(repositories.length)
            var enough = limit>0?repositories.length>=limit:false;
            if( repos.length === per_page && !enough){
              return fetchPage(page+1, processPage);
            }
            cb(error, repositories);
          }
          fetchPage(0, processPage)
        }
        

        var lookupOrg = function() {
          
          self.github.orgs.get( {org: cfg.orgId }, function(err, res){
            if( err ){
              return winston.error(err);
            }
            var githubStatus = {
                total_repos: (res.public_repos + res.total_private_repos),
                public_repos: res.public_repos,
                private_repos: res.total_private_repos,
                disk_usage: res.disk_usage
            }
            console.log("lookupOrg: "+JSON.stringify(githubStatus));
            global.pubsub.emit('status.now', {
              github: githubStatus
            })
            setTimeout( lookupOrg, 30*60000 );
          });
        }
        setTimeout( lookupOrg, 1000 );
    }
    return this;
}

exports = module.exports = AddonGithub;