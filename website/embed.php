<?php
	include("api/v1/version.php");
	
	$src = $_GET["src"];
	$playerVersion = $_GET["playerVersion"];
	
	if(!$playerVersion) {
		$playerVersion = $PLAYER_VERSION;
	}
?>
<script type="module" crossorigin src="https://damen3d.com/player/<?=$playerVersion?>/d3dplayer.js"></script>
<div id="damen3d-player" src="<?=addslashes($src)?>"></div>