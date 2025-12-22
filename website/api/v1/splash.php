<?php
	include("version.php");

	$origin = $_GET["origin"];
	$version = $_GET["v"];
	$theme = $_GET["theme"] == "dark" ? "dark" : "light";
	
	if($origin == "editor" && version_to_number($version) < version_to_number($EDITOR_VERSION)) {
		die(json_encode(array(
			"splash" => array(
				"origin" => "https://damen3d.com/splash/splash-editor.php?theme=$theme",
				"title" => "New Version Available",
				"width" => 760,
				"height" => 600,
				"resizable" => true
			)
		)));
	}
	if($origin == "player" && version_to_number($version) != version_to_number($PLAYER_VERSION)) {
		die(json_encode(array(
			"splash" => array(
				"origin" => "https://damen3d.com/splash/splash-player.php?theme=$theme",
				"title" => "New Version Available",
				"width" => 760,
				"height" => 600,
				"resizable" => true
			)
		)));
	}
	
	die(json_encode(array(
		"success" => true
	)));
?>