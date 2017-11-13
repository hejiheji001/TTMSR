'use strict';
var express = require('express');
var router = express.Router();
var sqlite3 = require('sqlite3').verbose();
var rest = require('restler');
var fs = require('fs');
var request = require('request');
var Jimp = require("jimp");
var md5 = require("md5");
const https = require("https");
const path = require('path');
const dbPath = path.resolve(__dirname, "../ttmsr.db");
const fetch = require('fetch-base64');
var base64 = "";

var db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the database.');
});

var goIndex = function (res, err) {
    res.render('welcome', { title: '天天民生日', Err: err || "" });
}

/* GET home page. */
router.get('/', function (req, res) {
    goIndex(res);
});

router.get('/tutorial', function (req, res) {
    res.render('tutorial', { title: '设置管理员权限'});
});

router.get('/ttmsr', function (req, res) {
    goIndex(res);
});

router.get('/updateValid', function (req, ress) {
    https.get("https://hejiheji001.github.io/account.json", res => {
        res.setEncoding("utf8");
        let body = "";
        res.on("data", data => {
            body += data;
        });

        res.on("end", (res) => {
            body = JSON.parse(body);
            var accounts = body.account;
            var valids = body.valid;
            var accountValues = `INSERT OR IGNORE INTO accounts (wxid, uk, pwd) VALUES ${accounts.map(a => `('${a.wxid}', '${a.uk}', '${a.pwd}')`).join(",")}`;
            var validsValues = `INSERT OR IGNORE INTO valid (wxid, end) VALUES ${valids.map(v => `('${v.wxid}', '${v.end}')`).join(",")}`;
            var ar = false;
            var vr = false;

            var a = new Promise(resolve => {
                db.run(accountValues, (err) => {
                    ar = err == null;
                    resolve(ar);
                });
            });

            var v = new Promise(resolve => {
                db.run(validsValues, (err) => {
                    vr = err == null;
                    resolve(vr);
                });
            });


            var update = async () => {
                a.then(() => {
                    v.then(() => {
                        ress.json({
                            "reply": ar && vr
                        });
                    });
                });
            }
            update();
        });
    });
});

router.post("/getImg", function (req, res) {
    var img = req.body.url;
    var ukmd5 = md5(req.body.uk);
    Jimp.read(img).then((image) => {
        let filename = `./public/images/${ukmd5}.jpg`;

        fs.unlink(filename, function (err) {
            if (err && err.code == 'ENOENT') {
                // file doens't exist
                console.info("File doesn't exist, won't remove it.");
            } else if (err) {
                // other errors, e.g. maybe we don't have enough permission
                console.error("Error occurred while trying to remove file");
            } else {
                console.info(`removed`);
            }
        });

        image.write(filename, function () {
            let stats = fs.statSync(filename);
            let len = stats["size"];
            let i = rest.file(filename, null, len, null, 'image/jpg');
            var form = {
                "username": "hejiheji001",
                "password": "CE649C68CCB1763AC369C4A05EEC3914",
                "typeid": "3050",
                "softid": "84562",
                "softkey": "ea41751488db4a43a55cb436cd35afac",
                "image": i
            }

            rest.post('http://api.ruokuai.com/create.json', {
                multipart: true,
                data: form,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:24.0) Gecko/20100101 Firefox/24.0',
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }).on('complete', function (data) {
                var captcha = JSON.parse(data);
                res.json({
                    "src": `\\images\\${ukmd5}.jpg`,
                    "captcha": captcha.Result.toUpperCase()
                });
            });
        });
    });

});


router.post("/proxy", function (req, ress) {
    var url = req.body.url;
    https.get(url, res => {
        res.setEncoding("utf8");
        let body = "";
        res.on("data", data => {
            body += data;
        });

        res.on("end", (res) => {
            body = JSON.parse(body);
            ress.json({
                "reply": body.reply
            });
        });
    });
});


router.post('/ttmsr', function (req, res) {
    var wxid = req.body.wxid;
    var pwd = req.body.pwd;
    if (wxid && pwd) {
        db.get(`SELECT pwd, uk FROM accounts where wxid = '${wxid}'`, function (err, row) {
            if (row) { 
                if (row.pwd == pwd) {
                    db.get(`SELECT end FROM valid where wxid = '${wxid}'`, function (err, r) {
                        if (r && (r.end && new Date() >= new Date(r.end))) {
                            goIndex(res, "使用已到期 如果已经续费请点击更新授权文件按钮 更新完毕请重启工具");
                        } else {
                            if (pwd === Buffer.from(wxid).toString('base64')) {
                                res.render('changepassword', { title: '修改密码' });
                            } else {
                                res.render('index', { title: '天天民生日工具增强版', user: wxid, uk: row.uk });
                            }
                        }
                    });                    
                } else {
                    goIndex(res, "密码错误");
                }
            } else {
                goIndex(res, "用户不存在 请尝试更新授权 更新完毕后请重启工具");
            }
        });
    }
});

router.get('/changepassword', function (req, res) {
    res.render('changepassword', { title: '修改密码' });
});

router.post('/changepassword', function (req, res) {
    var wxid = req.body.wxid;
    var pwd = req.body.pwd;
    var newpwd = req.body.newpwd;

    if (wxid && pwd && newpwd) {
        db.get(`SELECT pwd FROM accounts where wxid = '${wxid}' and pwd = '${pwd}'`, function (err, row) {
            if (row.pwd == pwd) {
                db.run(`UPDATE accounts SET pwd = '${newpwd}' where wxid = '${wxid}' and pwd = '${pwd}'`, function (err) {
                    if (err) {
                        goIndex(res, "请用管理员权限打开工具，具体见登陆按钮右边");
                    } else {
                        goIndex(res, "请用新密码登陆");
                    }
                });
                
            } else {
                goIndex(res, "原密码错误");
            }
        }); 
    } else {
        res.render('changepassword', { title: '修改密码' });
    }
});

module.exports = router;
