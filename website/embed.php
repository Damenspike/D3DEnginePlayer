<?php
	$version = "1.2.0-beta.0";

	$src = $_GET["src"];
?>
<script type="module" crossorigin src="https://damen3d.com/player/<?=$version?>/d3dplayer.js"></script>
<div id="damen3d-player" src="<?=addslashes($src)?>"></div>