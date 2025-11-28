<?php
	$name = $_GET["name"];
	
	if(!file_exists("./assets/demos/$name.d3d"))
		die(redirect("/404"));
?>
<head>
	<meta name="viewport"
	  content="width=device-width, height=device-height,
			   initial-scale=1, maximum-scale=1, minimum-scale=1,
			   user-scalable=no, viewport-fit=cover">
	<title><?=$name?> Demo | Damen3D</title>
	 <style>
		 html, body {
			 margin: 0;
			 padding: 0;
			 height: 100%;
			 overflow: hidden;            /* stops page scrolling */
			 overscroll-behavior: none;   /* no bounce / chain-scroll */
			 touch-action: none;          /* don't interpret as scroll/zoom */
		 }
		 
		 .game,
		 .game canvas, iframe {
			 touch-action: none;              /* Disable pinch-zoom, double-tap zoom, scroll */
			 -ms-touch-action: none;          /* Old Edge */
			 -webkit-user-select: none;       /* No text selection */
			 user-select: none;
			 -webkit-user-drag: none;         /* No image drag */
			 overscroll-behavior: contain;    /* Stops scroll chaining to page */
		 }
	 </style>
</head>
<iframe src="https://damen3d.com/embed.php?src=https://damen3d.com/assets/demos/<?=$name?>.d3d?5" class="game" width="100%" height="100%"  frameborder="0"></iframe>

<script>
	// iOS Safari specific gesture events (non-standard)
	document.addEventListener('gesturestart', function (e) {
		e.preventDefault();
	}, { passive: false });

	document.addEventListener('gesturechange', function (e) {
		e.preventDefault();
	}, { passive: false });

	document.addEventListener('gestureend', function (e) {
		e.preventDefault();
	}, { passive: false });
</script>