"use strict";

var bcrypt = require('bcrypt-as-promised');
var marked = require('marked');
var emoji = require('node-emoji');
var HASH_ROUNDS = 10;

// This is a helper function to map a flat post to nested post
function transformPost(post) {
    return post = {
        id: post.posts_id,
        title: emoji.emojify(post.posts_title),
        url: post.posts_url,
        createdAt: post.posts_createdAt,
        updatedAt: post.posts_updatedAt,
        voteScore: post.voteScore,
        topScore: post.top,
        hotScore: post.hot,
        numUpvotes: post.numUpvotes,
        numDownvotes: post.numDownvotes,

        user: {
            id: post.users_id,
            username: post.users_username,
            createdAt: post.users_createdAt,
            updatedAt: post.users_updatedAt
        },
        subreddit: {
            id: post.subreddits_id,
            name: post.subreddits_name,
            description: marked(post.subreddits_description),
            createdAt: post.subreddits_createdAt,
            updatedAt: post.subreddits_updatedAt
        }
    };
    
}

class RedditAPI {
    constructor(conn) {
        this.conn = conn;
    }

    /*
    user should have username and password
     */
    createUser(user) {
        /*
         first we have to hash the password. we will learn about hashing next week.
         the goal of hashing is to store a digested version of the password from which
         it is infeasible to recover the original password, but which can still be used
         to assess with great confidence whether a provided password is the correct one or not
         */
        return bcrypt.hash(user.password, HASH_ROUNDS)
        .then(hashedPassword => {
            return this.conn.query(
             `  
            INSERT INTO users (username, password, email, createdAt, updatedAt) 
            VALUES (?, ?, ?, NOW(), NOW())`,
            [user.username, hashedPassword, user.email]);
        })
        .then(result => {
            return result.insertId;
        })
        .catch(error => {
            // Special error handling for duplicate entry
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('A user with this username already exists');
            }
            else {
                throw error;
            }
        });
    }

    /*
    post should have userId, title, url, subredditId
     */
    createPost(post) {
        if (!post.subredditId) {
            return Promise.reject(new Error("There is no subreddit id"));
        }

        return this.conn.query(
            `
                INSERT INTO posts (userId, title, url, createdAt, updatedAt, subredditId)
                VALUES (?, ?, ?, NOW(), NOW(), ?)`,
            [post.userId, post.title, post.url, post.subredditId]
        )
        .then(result => {
            return result.insertId;
        });
    }

    getAllPosts(optionalSubredditId, sortingMethod) {
        /*
         strings delimited with ` are an ES2015 feature called "template strings".
         they are more powerful than what we are using them for here. one feature of
         template strings is that you can write them on multiple lines. if you try to
         skip a line in a single- or double-quoted string, you would get a syntax error.

         therefore template strings make it very easy to write SQL queries that span multiple
         lines without having to manually split the string line by line.
        */
        if (arguments.length < 2) { // Case where we only have 1 argument
            if (isNaN(arguments[0])) { // Case where that argument is a string i.e a sorting method
                sortingMethod = optionalSubredditId;
                optionalSubredditId = undefined;
            }
            /*
            else { // Case where that argument is a number i.e a subredditId
                // Values are good, no else needed
            }
            */
        }
        var optionalWhere = '';
        if (optionalSubredditId) {optionalWhere = 'WHERE s.id = ?'}
        
        var sorting = 'ORDER BY p.createdAt DESC';
        if(sortingMethod === 'hot') {sorting = 'ORDER BY hot DESC'}
        else if(sortingMethod === 'top') {sorting = 'ORDER BY top DESC'}
        return this.conn.query(
            `
            SELECT
                p.id AS posts_id,
                p.title AS posts_title,
                p.url AS posts_url,
                p.createdAt AS posts_createdAt,
                p.updatedAt AS posts_updatedAt, 
                
                u.id AS users_id,
                u.username AS users_username,
                u.createdAt AS users_createdAt,
                u.updatedAt AS users_updatedAt,
                
                s.id AS subreddits_id,
                s.name AS subreddits_name,
                s.description AS subreddits_description,
                s.createdAt AS subreddits_createdAt,
                s.updatedAt AS subreddits_updatedAt,
                
                COALESCE(SUM(v.voteDirection), 0) AS voteScore,
                COALESCE(SUM(v.voteDirection), 0) AS top,
                COALESCE(SUM(v.voteDirection), 0)/(NOW()-p.createdAt) AS hot,
                SUM(IF(v.voteDirection = 1, 1, 0)) AS numUpvotes,
                SUM(IF(v.voteDirection = -1, 1, 0)) AS numDownvotes
                
            FROM posts p
                JOIN users u ON p.userId = u.id
                JOIN subreddits s ON p.subredditId = s.id
                LEFT JOIN votes v ON p.id = v.postId
            ${optionalWhere} 
            GROUP BY p.id
            ${sorting}
            LIMIT 25`, [optionalSubredditId]
        )
        .then(function(posts) {
             return posts.map(transformPost);
        });
    }

    // Similar to previous function, but retrieves one post by its ID
    getSinglePost(postId) {
        return this.conn.query(
            `
            SELECT
                p.id AS posts_id,
                p.title AS posts_title,
                p.url AS posts_url,
                p.createdAt AS posts_createdAt,
                p.updatedAt AS posts_updatedAt, 
                
                u.id AS users_id,
                u.username AS users_username,
                u.createdAt AS users_createdAt,
                u.updatedAt AS users_updatedAt,
                
                s.id AS subreddits_id,
                s.name AS subreddits_name,
                s.description AS subreddits_description,
                s.createdAt AS subreddits_createdAt,
                s.updatedAt AS subreddits_updatedAt,
                
                COALESCE(SUM(v.voteDirection), 0) AS voteScore,
                SUM(IF(v.voteDirection = 1, 1, 0)) AS numUpvotes,
                SUM(IF(v.voteDirection = -1, 1, 0)) AS numDownvotes
                
            FROM posts p
                JOIN users u ON p.userId = u.id
                JOIN subreddits s ON p.subredditId = s.id
                LEFT JOIN votes v ON p.id = v.postId
            
            WHERE p.id = ?`,
            [postId]
        )
        .then(function(posts) {
            if (posts.length === 0) {
                return null;
            }
            else {
                return transformPost(posts[0]);
            }
        });
    }

    /*
    subreddit should have name and optional description
     */
    createSubreddit(subreddit) {
        return this.conn.query(
            `INSERT INTO subreddits (name, description, createdAt, updatedAt)
            VALUES(?, ?, NOW(), NOW())`, [subreddit.name, subreddit.description])
        .then(function(result) {
            return result.insertId;
        })
        .catch(error => {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('A subreddit with this name already exists');
            }
            else {
                throw error;
            }
        });
    }

    getAllSubreddits() {
        return this.conn.query(`
            SELECT id, name, description, createdAt, updatedAt
            FROM subreddits ORDER BY createdAt DESC`
        )
        .then(result => {
            return result.map(subreddits => {
                subreddits.description = marked(subreddits.description);
                return subreddits;
            })
        })
    }
    
    getSubredditByName(name) {
        return this.conn.query(`
            SELECT *
            FROM subreddits
            WHERE name = ?`,
            [name]
        ).then(name =>{
            if(name.length === 0){
                return null;
            }
            else {
                name[0].description = marked(name[0].description)
                return name[0];
            }
        });
    }

    /*
    vote must have postId, userId, voteDirection
     */
    createVote(vote) {
        console.log(vote.voteDirection)
        if (vote.voteDirection != 1 && vote.voteDirection != -1 && vote.voteDirection != 0) {
            return Promise.reject(new Error("voteDirection must be one of -1, 0, 1"));
        }

        return this.conn.query(`
            INSERT INTO votes (postId, userId, voteDirection)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE voteDirection = ?`,
            [vote.postId, vote.userId, vote.voteDirection, vote.voteDirection]
        );

    }
    
    createCommentVote(vote) {
        if (vote.voteDirection != 1 && vote.voteDirection != -1 && vote.voteDirection != 0) {
            return Promise.reject(new Error("voteDirection must be one of -1, 0, 1"));
        }

        return this.conn.query(`
            INSERT INTO commentVotes (commentId, userId, voteDirection, createdAt, updatedAt)
            VALUES (?, ?, ?, NOW(), NOW())
            ON DUPLICATE KEY UPDATE voteDirection = ?`,
            [vote.commentId, vote.userId, vote.voteDirection, vote.voteDirection]
        );
    }

    /*
    comment must have userId, postId, text
     */
    createComment(comment) {
        return this.conn.query(`
            INSERT INTO comments (userId, postId, text, createdAt, updatedAt)
            VALUES (?, ?, ?, NOW(), NOW())`,
            [comment.userId, comment.postId, comment.text]
        )
        .then(result => {
            return result.insertId;
        });
    }

    getCommentsForPost(postId) {
        return this.conn.query(`
            SELECT
                c.id as comments_id,
                c.text as comments_text,
                c.createdAt as comments_createdAt,
                c.updatedAt as comments_updatedAt,
                
                u.id as users_id,
                u.username as users_username,
               
                COALESCE(SUM(v.voteDirection), 0) AS voteScore,
                SUM(IF(v.voteDirection = 1, 1, 0)) AS numUpvotes,
                SUM(IF(v.voteDirection = -1, 1, 0)) AS numDownvotes
                
                
            FROM comments c
                JOIN users u ON c.userId = u.id
                LEFT JOIN commentVotes v ON c.id = v.commentId
                
            WHERE c.postId = ?
            GROUP BY c.id
            ORDER BY voteScore DESC, c.createdAt DESC
            LIMIT 25`,
            [postId]
        )
        .then(function(results) {
            return results.map(function(result) {
                return {
                    id: result.comments_id,
                    text: emoji.emojify(result.comments_text),
                    createdAt: result.comments_createdAt,
                    updatedAt: result.comments_updatedAt,
                    voteScore: result.voteScore,
                    numUpvotes: result.numUpvotes,
                    numDownvotes: result.numDownvotes,
                    user: {
                        id: result.users_id,
                        username: result.users_username
                    }
                };
            });
        });
    }

    checkUserLogin(username, password) {
        /*
        Here are the steps you should follow:

            1. Find an entry in the users table corresponding to the input username
                a. If no user is found, make your promise throw an error "username or password incorrect".
                b. If you found a user, move to step 2
            2. Use the bcrypt.compare function to check if the database's hashed password matches the input password
                a. if it does, make your promise return the full user object minus the hashed password
                b. if it doesn't, make your promise throw an error "username or password incorrect"
         */
        
        return this.conn.query(
            `
            SELECT *
            FROM users
            WHERE username = ?
            `,[username]
            )
            .then(user => {
                if(user.length > 0) { 
                    return bcrypt.compare(password, user[0].password/*bcrypt.hash(password, HASH_ROUNDS)*/).then(function(res) {
                        delete user[0].password;
                        return user[0];
                    }).catch(error => {
                        throw new Error("username or password incorrect")
                    })
                }
                else {
                    throw new Error("username or password incorrect")
                }
                
            })
    }

    createUserSession(userId) {
        var token;
        return bcrypt.genSalt()
        
            .then(_token => {
                token = _token;
                return this.conn.query('INSERT INTO sessions (userId, token) VALUES (?, ?)', [userId, _token]);
            })
            .then(result => {
                return token;
            });
    }        
        /*
         Here are the steps you should follow:

         1. Use bcrypt's genSalt function to create a random string that we'll use as session id (promise)
         2. Use an INSERT statement to add the new session to the sessions table, using the input userId
         3. Once the insert is successful, return the random session id generated in step 1
         */

    
    logout(userId) {
        var token;
        return this.conn.query('INSERT INTO sessions (userId, token) VALUES (?,?)', [userId, token])
        .then(result => {
            return token;
        })
    }
    
    getAllPostsForUsername(username){
        return this.conn.query(`
            SELECT
                p.id AS posts_id,
                p.title AS posts_title,
                p.url AS posts_url,
                p.createdAt AS posts_createdAt,
                p.updatedAt AS posts_updatedAt, 
                
                u.id AS users_id,
                u.username AS users_username,
                
                s.id AS subreddits_id,
                s.name AS subreddits_name,
                
                COALESCE(SUM(v.voteDirection), 0) AS voteScore,
                SUM(IF(v.voteDirection = 1, 1, 0)) AS numUpvotes,
                SUM(IF(v.voteDirection = -1, 1, 0)) AS numDownvotes
                
            FROM posts p
                JOIN users u ON u.id = p.userId
                JOIN subreddits s ON p.subredditId = s.id
                LEFT JOIN votes v ON p.id = v.postId
            WHERE u.username = ?
            GROUP BY p.id
            ORDER BY posts_createdAt DESC
            LIMIT 25`,
            [username]
        )
        .then(results =>{
            return results.map(function(result){
                return{
                        title: emoji.emojify(result.posts_title),
                        url: result.posts_url,
                        voteScore: result.voteScore,
                        numUpvotes: result.numUpvotes,
                        numDownvotes: result.numDownvotes,
                        user: {
                                username: result.users_username,
                            },
                        subreddit: {
                                    name: result.subreddits_name,
                                }
                    };
            });
        });
    }

    getUserFromSession(sessionId) {
        return this.conn.query(
            `
            SELECT 
                u.id AS user_id,
                u.username AS user_username,
                u.password AS user_password,
                u.createdAt AS user_createdAt,
                u.updatedAt AS user_updatedAt
                
            FROM users u
                JOIN sessions s on s.userId = u.id
            
            WHERE s.token = ?
            `,[sessionId]
        ).then(user => {
            return {
                id: user[0].user_id,
                username: user[0].user_username,
                password: user[0].user_password,
                createdAt: user[0].user_createdAt,
                updatedAt: user[0].user_updatedAt
            };
        })
    }
    
    checkEmail(email) {
        var resetToken;
        var userId;
        return this.conn.query(
            `
            SELECT 
                u.id AS id,
                u.email AS email
            FROM users u
            WHERE u.email = ?
            `,[email]
        ).then(user => {
            if (user.length > 0) {
                return user[0].id;
            }
        })
    }
        
    createPasswordResetToken(userId) {
        var resetToken
        return bcrypt.genSalt()
        .then(token => {
            resetToken = token;
            return this.conn.query('INSERT INTO passwordResetTokens (userId, token) VALUES (?, ?)', [userId, resetToken])
        })
        .then(insertId => {
            return resetToken;    
        })
    }
    
    resetPassword(token, newPassword) {
        var validToken;
        var forgetfulUser;
        // console.log('in resetPassword') // tracker
        return this.conn.query(
            // Get user ID with that reset token
            `
            SELECT 
                u.id
            FROM users u
            JOIN passwordResetTokens p
                ON u.id = p.userId
            WHERE p.token = ?
            `, [token]
        ).then(tokenUser => {
            // console.log('Gonna verify reset token') // tracker
            // console.log(tokenUser) // Verifying value
            if (tokenUser.length)  { // Verify whether token if valid
                validToken = true;
                forgetfulUser = tokenUser[0].id;
            } 
        }).then(result => {
            // console.log('Hashing password') // tracker
            return bcrypt.hash(newPassword, HASH_ROUNDS)
        }).then(hashedPassword => {
            if (validToken) {
                // console.log('Changing password') // tracker
                return this.conn.query( // Setting a new password
                    `
                    UPDATE users
                    SET password = ?
                    WHERE id = ?
                    `, [hashedPassword, forgetfulUser]
                )
            } else {
                return undefined;
            }
        }).then(result => {
            if (validToken) { // Verify if reset token was valid
                // console.log('Deleting reset token') // tracker
                this.conn.query( // Delete reset token
                    `
                    DELETE FROM passwordResetTokens
                    WHERE token = ?
                    `, [token]
                )
            }
        })
    }
}

module.exports = RedditAPI;