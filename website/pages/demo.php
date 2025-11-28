<?php
	$name = $pageparts[1];
	if(!file_exists("./assets/demos/$name.d3d"))
		die(redirect("/404"));
		
	die(redirect("/demo.php?name=$name"));
?>

<center>
	<iframe 
		src="https://damen3d.com/embed.php?src=https://damen3d.com/assets/demos/<?=$name?>.d3d?4"
		width="100%"
		height="100%"
		style="max-width: 1000px;max-height: 600px;border: 0px;"
	></iframe>
	
	<br /> <br />
	
	<a href="/" class="bl">
		Back to home
	</a>
</center>