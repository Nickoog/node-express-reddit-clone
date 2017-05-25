var express = require('express');

module.exports = function(myReddit) {
    var authController = express.Router();
    
    authController.get('/login', function(request, response) {
        response.render('login-form');
    });
    
    authController.post('/login', function(request, response) {
        myReddit.checkUserLogin(request.body.username, request.body.password)
        .then(result => {
            myReddit.createUserSession(result.id)
            .then(newSessionId => {
                response.cookie('SESSION', newSessionId)
                response.redirect('/')
            })
        }).catch(error => {
            response.status(401).send('username or password invalid')
        })
    });
    
    authController.get('/signup', function(request, response) {
        response.render('signup-form');
    });
    
    authController.post('/signup', function(request, response) {
        myReddit.createUser({
            username: request.body.username,
            password: request.body.password,
            email: request.body.email
        })
        .then(newUser =>{
            response.redirect('/auth/login')
        })
        .catch(error => {
            response.status(400).send('this username already exists')
        })
    });
    
    authController.post('/logout', function(request, response) {
        myReddit.getUserFromSession(request.cookies.SESSION)
        .then(userInfo => {
            return myReddit.logout(userInfo.id)
            .then(newSessionId => {
                response.cookie('SESSION', newSessionId);
                response.redirect('/');
            })
        })    
    })

            
    
    authController.get('/recover', function(request, response) {
        response.render('recover-form');
        
    });
    
    authController.post('/createResetToken', function(request, response) {
        myReddit.checkEmail(request.body.email)
        .then(userId => { 
                if (userId) {
                    myReddit.createPasswordResetToken(userId)
                    .then(resetToken => {
                            var api_key = 'key-b489b734ea95dbf5e14e3e9b1da18db2';
                            var domain = 'sandbox4712b2f75d5b4f76824739c5fc560c4d.mailgun.org';
                            var mailgun = require('mailgun-js')({apiKey: api_key, domain: domain});
                            var data = {
                                from: 'Administrator <isdoing_yourmom@home.now>',
                                to: request.body.email,
                                subject: 'Password reset for your r3Ddit account',
                                text: 
                                `
                                Link : https://node-express-reddit-clone-alexcadieux.c9users.io/auth/resetPassword?token=${resetToken} // need modification
                                ` 
                            };
                            console.log(data.text) 
                            mailgun.messages().send(data, function (error, body) {
                                console.log(body);
                            });
                        response.redirect('/');
                    })
                } else {
                    response.status(401).send('Email provided was not found to match any account in our database. Please double-check entry.')
                }
        })
    });
    
    authController.get('/resetPassword', function(request, response) {
        if (request.query.token) {
                response.render('reset-password-form', {token: request.query.token})
        } else {
            response.send('Password reset link invalid');
        }
    });

    authController.post('/resetPassword', function(request, response) {
        if (request.body.newPassword == request.body.passwordConfirmation) {
            myReddit.resetPassword(request.body.token, request.body.newPassword)
            .then(
                response.redirect('/')
            )    
        } else {
            response.send('Password confirmation failed')
        }
    });
    return authController;
}

