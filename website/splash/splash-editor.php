<?php
	$theme = $_GET["theme"];
?>

<html>
	<head>
		<!-- Adobe Fonts !-->
		<link rel="stylesheet" href="https://use.typekit.net/zoo4jqi.css">
		
		<?php
			include_once("../assets/css/style.php");
		?>
		
		<style>
			body {
				margin: 20px;
				font-family: "proxima-nova", sans-serif;
				background: white;
				color: black;
			}
			
			<?php
				if($theme == "dark") {
					?>
						body {
							background: #202020;
							color: white;
						}
					<?php
				}
			?>
		</style>
	</head>
	<body>
		
		<center>
			<h1>Update your Editor</h1>
			
			<?php include("updates_editthis.php"); ?>
			
			<p>
				<a href='/download/#editor' target='_blank' class='button'>Download</a>
			</p>
		</center>
		
	</body>
</html>