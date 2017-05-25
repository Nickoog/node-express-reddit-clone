var mysql = require('promise-mysql');


var RedditAPI = require('./lib/reddit.js');
var connection = mysql.createPool({
    user: 'root',
    database: 'reddit'
});
var myReddit = new RedditAPI(connection);

//  myReddit.createUserSession('1385').then(console.log);
// myReddit.createUser({
//     username: 'alex',
//     password: 'test'
// }).then(console.log)
// myReddit.checkUserLogin('alex', 'test').then(console.log
// myReddit.getUserFromSession('$2a$10$.Gzkq.ZQbYVuWf/SeHs8vu');
// myReddit.getSubredditByName('petit chien').then(console.log);
// myReddit.getAllPosts().then(console.log);

// Sin's tests
// myReddit.createUser({
//     username: "sinriver413",
//     password: "montreal5",
//     email: "sinriver413@hotmail.com"
// })
// .then(console.log); // It printed 1400.
myReddit.checkEmail("sinriver413@hotmail.com").then(console.log);
