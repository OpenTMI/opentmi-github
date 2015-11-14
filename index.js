var GitHubApi = require("github");
var nconf = require('nconf');
var winston = require('winston');
var _ = require('underscore');

function AddonGithub (app, server, io, passport){
    var self = this;
    this.name = 'GitHub addon';
    this.description = 'Integrate Github to TMT';
    this.listDependencies = ['github'];
  
    var cfg = nconf.get('github');
    
    this.register = function(){
        
        if( !cfg || !cfg.authentication ) {
          winston.error('github not configured');
          return;
        }
        
        global.pubsub.emit('status.now.init', {
            github: {
              public_repos: 0,
              private_repos: 0,
              total_repos: 0,
              disk_usage: 0
            }
        });

        app.get('/github', function(req, res){
          res.json({ok: 1});
        });

        self.github = new GitHubApi({
            // required 
            version: "3.0.0",
            // optional 
            //debug: true,  
            timeout: 5000,
        });
        self.github.authenticate( cfg.authentication );
        /*
        github.repos.getAll({}, function(error, repos){
          console.log("repos.getAll()");
          console.log(error);
          console.log(repos);
        });*/
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