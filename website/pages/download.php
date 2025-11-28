<?php
	include("../api/v1/version.php");
?>
<style>
	.download {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 15px;
		padding: 15px;
		margin-bottom: 10px;
	}
</style>
<center>
	<div class='reading'>
		
		<div class='download'>
			<h1 id='player'>Download Player</h1>
			
			<p class='gray'>
				Current version: <?=$PLAYER_VERSION?> player
			</p>
			
			<div class='platform'>
				<h2>Windows</h2>
				<a 
					href='https://d3dsource.s3.us-east-1.amazonaws.com/Damen3D-Player-<?=$PLAYER_VERSION?>-arm64-setup.exe'
					class='button'
				>
					Download (arm64)
				</a>
				<a 
					href='https://d3dsource.s3.us-east-1.amazonaws.com/Damen3D-Player-<?=$PLAYER_VERSION?>-x64-setup.exe'
					class='button'
				>
					Download (intel)
				</a>
			</div>
			<div class='platform'>
				<h2>Mac</h2>
				<a 
					href='https://d3dsource.s3.us-east-1.amazonaws.com/Damen3D+Player-<?=$PLAYER_VERSION?>-arm64.dmg'
					class='button'
				>
					Download (arm64)
				</a>
				<a 
					href='https://d3dsource.s3.us-east-1.amazonaws.com/Damen3D+Player-<?=$PLAYER_VERSION?>.dmg'
					class='button'
				>
					Download (intel)
				</a>
			</div>
		</div>
		
		<div class='download'>
			<h1 id='editor'>Download Editor</h1>
			
			<p class='gray'>
				Current version: <?=$EDITOR_VERSION?> editor
			</p>
			
			<div class='platform'>
				<h2>Windows</h2>
				<a 
					href='https://d3dsource.s3.us-east-1.amazonaws.com/Damen3D-Editor-<?=$EDITOR_VERSION?>-arm64-setup.exe'
					class='button'
				>
					Download (arm64)
				</a>
				<a 
					href='https://d3dsource.s3.us-east-1.amazonaws.com/Damen3D-Editor-<?=$EDITOR_VERSION?>-x64-setup.exe'
					class='button'
				>
					Download (intel)
				</a>
			</div>
			<div class='platform'>
				<h2>Mac</h2>
				<a 
					href='https://d3dsource.s3.us-east-1.amazonaws.com/Damen3D+Editor-<?=$EDITOR_VERSION?>-arm64.dmg'
					class='button'
				>
					Download (arm64)
				</a>
				<a 
					href='https://d3dsource.s3.us-east-1.amazonaws.com/Damen3D+Editor-<?=$EDITOR_VERSION?>.dmg'
					class='button'
				>
					Download (intel)
				</a>
			</div>
		</div>
		
	</div>
</center>