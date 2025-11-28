<?php
	require_once("client.php");
	
	connect_db();
	
	if(!$_POST) {
		die(redirect("/403"));
	}
	
	$username = $_POST["username"];
	$password = $_POST["password"];	
	$captcha = $_POST["g-recaptcha-response"];
	
	$ip = $_SERVER["HTTP_CF_CONNECTING_IP"];
	
	$requireCaptcha = false;
	
	$q = $MYSQL->query("SELECT * FROM `iploginattempts` WHERE ip = '?' LIMIT 1", array($ip));
	$failed = $MYSQL->assoc($q);
	
	if($failed) {
		$diff = time() - $failed["lastTry"];
		if($diff > 600) {
			$MYSQL->query("DELETE FROM iploginattempts WHERE ip = '?'", array($ip));
		}else{
			if($failed["failed"] >= 8) {
				error("Please try again in " . (ceil((($failed["lastTry"] + 600) - time()) / 60)) . " minute(s).");
			}else
			if($failed["failed"] >= 3) {
				$requireCaptcha = true;
			}
		}
	}
	
	if(!$username || !$password) {
		error("Enter a username and password");
	}
	
	if($requireCaptcha) {
		$response = file_get_contents("https://www.google.com/recaptcha/api/siteverify?secret=$CAPTCHA_KEY&response=$captcha&remoteip=".$_SERVER['HTTP_CF_CONNECTING_IP']);
		$res = json_decode($response, true);
		if(!$res["success"]) {
			error("Invalid reCAPTCHA. Please try again.");
		}
	}
	
	$user = $MYSQL->getrowq(
		"SELECT `id`,`username`,`password` FROM users WHERE `username` = '?'", 
		array($username)
	);
	$hashedPassword = $user["password"];
	
	if(!password_verify($password, $hashedPassword)) {
		incorrect();
		error("Incorrect email address or password");
	}
	
	$authKey = sha1(generateRandomString(128));
	$MYSQL->query("UPDATE users SET `webauth` = '?' WHERE `username` = '?'", array($authKey, $username));
	
	setcookie("vprauth", $authKey, time()+948248, "/", ".veloproracer.com", true, true);
	$_COOKIE["vprauth"] = $randKey;
	
	success();
	
	function error($e) {
		global $MYSQL;
		global $username;
		global $requireCaptcha;
		global $ERROR;
		global $username;
		
		$_GET["page"] = "login";
		$ERROR = $e;
		
		include("index.php");
		die();
	}
	function success() {
		global $MYSQL;
		global $ip;
		global $BASE_URL;
		global $_POST;
		$MYSQL->query("DELETE FROM iploginattempts WHERE ip = '?'", array($ip));
		
		if($_POST["from_racepass"])
			die(redirect("/racepass#plans"));
		
		die(redirect("/account"));
	}
	function incorrect() {
		global $MYSQL;
		global $ip;
		$q = $MYSQL->query("SELECT * FROM `iploginattempts` WHERE ip = '?'", array($ip));
		$nr = $MYSQL->num_rows($q);
		if($nr > 0) {
			$MYSQL->query("UPDATE iploginattempts SET failed = failed + 1, lastTry = '?' WHERE ip = '?'", array(time(),$ip));
		}else{
			$MYSQL->query("INSERT INTO iploginattempts (id, ip, failed, lastTry) VALUES (NULL, '?', 1, '?')", array($ip, time()));
		}
	}
?>