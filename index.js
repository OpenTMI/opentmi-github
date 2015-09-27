var GitHubApi = require("github");
var nconf = require('nconf');
var winston = require('winston');
var _ = require('underscore');

function AddonGithub (app, server, io, passport){
  var self = this;
	this.name = 'GitHub addon';
	this.description = 'Integrate Github to TMT';
  this.listDependencies = ['github'];
  var orgId = 'ARMmbed';
  if( !nconf.get('github')  ) {
    winston.error('github not configured');
    return;
  }
  var github;
	this.register = function(){
		app.get('/github', function(req, res){
		  res.json({ok: 1});
		});

    github = self.github = new GitHubApi({
        // required 
        version: "3.0.0",
        // optional 
        //debug: true,  
        timeout: 5000,
    });
    github.authenticate(
        nconf.get('github').authentication
    );
/*
    github.repos.getAll({}, function(error, repos){
      console.log("repos.getAll()");
      console.log(error);
      console.log(repos);
    });*/
    var lookupOrg = function() {
      github.orgs.get( {org: orgId }, function(err, res){
        if( err ){
          return winston.error(err);
        }
        global.pubsub.emit('github', {
          public_repos: res.public_repos,
          private_repos: res.total_private_repos,
          disk_usage: res.disk_usage
        })
      });
    }

    setInterval( lookupOrg, 10000 );
    
	}


  return this;
}

exports = module.exports = AddonGithub;