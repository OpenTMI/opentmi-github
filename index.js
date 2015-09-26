
function AddonGithub (app, server, io, passport){

	this.name = 'GitHub addon';
	this.description = 'Integrate Github to TMT';
  this.listDependencies = [];

	this.register = function(){
		app.get('/github', function(req, res){
		  res.json({ok: 1});
		});
	}
  return this;
}

exports = module.exports = AddonGithub;