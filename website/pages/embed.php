<center>
	<div class='reading'>
		<div class='download'>
			<h1 id='browser'>Embed my game on a webpage</h1>
			<p>You can publish your project to a HTML file via the editor or copy this code below.</p>
			
			<p>Change <code>path/to/file.d3d</code> to the path that goes to your d3d file.</p>
			
			<div class='platform'>
				<h2>Standard method</h2>
				<div class='code'>
					<?=htmlentities('<script type="module" crossorigin src="https://damen3d.com/player/1.2.0-beta.0/d3dplayer.js"></script>
					<div id="damen3d-player" src="path/to/file.d3d"></div>')?>
				</div>
			</div>
			
			<div class='platform'>
				<h2>iframe method</h2>
				<div class='code'>
					<?=htmlentities('<iframe 
						src="https://damen3d.com/embed.php?src=path/to/file.d3d"
						width="100%"
						height="100%"
						style="max-width: 1000px;max-height: 600px;border: 0px;"></iframe>')?>
				</div>
			</div>
		</div>
	</div>
</center>