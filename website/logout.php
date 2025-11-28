<?php
	error_reporting(0);
	
	if(!isset($_COOKIE["vprauth"])) {
		?>
			<meta http-equiv="Refresh" content="0; url='/'">
		<?php
		die();
	}

	include("client.php");
	
	setcookie("vprauth", null, -1, "/", ".veloproracer.com", true, true);
	unset($_COOKIE["vprauth"]);
	
	redirect("/login", 0);
?>