<?php
	function drawDemoCard($name, $title = "") {
		if(!$title) $title = $name;
		$url = "/demo/" . strtolower($name);
		?>
			<div class='demo-block'>
				<div class='demo-content'>
					<a href='<?=$url?>'>
						<img src='/assets/images/demo-<?=strtolower($name)?>.png' />
					</a>
					<center>
						<a href='<?=$url?>' class='button'><?=$title?> Demo</a>
					</center>
				</div>
			</div>
		<?php
	}
?>

<center>
	<div class='content front-splash'>
		
		<div class='text'>
			<p>
				<img src='/assets/images/d3dlogowhite.png' width='150' />
			</p>
			<h1>Easily make your own games</h1>
			<p>
				Built to make game development as easy as possible, Damen3D is an all-in-one engine for anyone looking to make simple and easily editable games.
			</p>
		</div>
		<div class='img'>
			<img src='/assets/images/editorsplash.png' class='no-select' />
		</div>
	</div>
	
	<div style="height: 40px;"></div>
	
	<div class='reading' id='demos'>
		<div class='demo-block'>
			<div class='demo-content'>
				<h2>Try it out</h2>
				<p>
					Here are some simple demo games showing how easy it is to create games for the browser or desktop.
				</p>
			</div>
		</div>
		<?=drawDemoCard("Aviation")?>
		<?=drawDemoCard("Car")?>
		<?=drawDemoCard("Waddle")?>
		<?=drawDemoCard("Snail")?>
		<?=drawDemoCard("BlueRealm", "Parcours")?>
	</div>
	
	<div>
		<h2>I challenge you</h2>
		<p>
			Some of these demos are included in the editor as templates. Can you make them better?
		</p>
	</div>
	
	<div style="height: 80px;"></div>
	
	<div class='reading' id='features'>
		<h1>Features of the engine</h1>
		
		<p class='gray' style="max-width: 500px;">
			Damen3D Engine is designed to be as simple as possible, both during the process of creating games, and in the process of publishing them. 
		</p>
		
		<div style="height: 20px;"></div>
		
		<div class='feature-blocks'>
			<div class='feature-block demo-block'>
				<div class='demo-content'>
					<h2>Create 3D and 2D games</h2>
					<p>Our editor lets you build 3D or 2D games right out of the box, or even mix both together to make rich vector-based UI.</p>
				</div>
			</div>
			<div class='feature-block demo-block'>
				<div class='demo-content'>
					<h2>Deliver to any platform</h2>
					<p>Damen3D uses web technology to deliver widely distributable and compatible experiences for both the browser, mobile and desktop.</p>
				</div>
			</div>
			<div class='feature-block demo-block'>
				<div class='demo-content'>
					<h2>Portable & flexible</h2>
					<p>Export projects as portable .d3d files that load at runtime, letting you update or swap game chunks instantly with full asset and script support.</p>
				</div>
			</div>
			<div class='feature-block demo-block'>
				<div class='demo-content'>
					<h2>GPU accelerated WebGL</h2>
					<p>Delivers fast, smooth, and efficient visuals powered directly by your graphics hardware.</p>
				</div>
			</div>
			<div class='feature-block demo-block'>
				<div class='demo-content'>
					<h2>High performance physics</h2>
					<p>Take advantage of system-optimized physics for fast, accurate collisions and smooth real-time simulation.</p>
				</div>
			</div>
			<div class='feature-block demo-block'>
				<div class='demo-content'>
					<h2>Free to use</h2>
					<p>Damen3D is completely free and requires no subscription to create or distribute games.</p>
				</div>
			</div>
		</div>
		
		<div style="height: 40px;"></div>
		
		<center>
			<a href='/download' class='button'>Download</a>
		</center>
	</div>
</center>

<style>
	/* MOB */
	.mob-content {
		.front-splash {
			width: auto;
			height: 150px;
			.text {
				top: 10px;
				left: 5px;
			}
			.img {
				display: none;
			}
		}
		.ib {
			display: block;
		}
		.demo-block {
			width: 100%;
			min-height: auto;
		}
		.feature-block {
			display: block;
			width: 100%;
			flex: none;
		}
	}
	
	.front-splash {
		position: relative;
		
		width: 100%;
		height: 400px;
		max-width: 1000px;
		margin: 40px;
		
		.text {
			position: absolute;
			top: 60px;
			left: 40px;
			z-index: 1;
			
			width: 100%;
			max-width: 450px;
			
			text-align: left;
			text-shadow: 0px 0px 10px black;
		}
		.img {
			position: absolute;
			
			z-index: 0;
			top: 20px;
			right: 20px;
			
			width: 70%;
			
			img {
				width: 100%;
				border-radius: 40px;
				filter: brightness(60%);
			}
		}
	}
	.tryit {
		text-align: left;
		max-width: 400px;
	}
	.demo-block {
		display: inline-block;
		vertical-align: middle;
		border-radius: 10px;
		background: rgba(0, 0, 0, 0.24);
		width: 300px;
		min-height: 260px;
		margin-bottom: 10px;
		
		.demo-content {
			padding: 25px;
		}
		
		img {
			margin-bottom: 15px;
			border-radius: 10px;
			width: 100%;
		}
	}
	.feature-blocks {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		justify-content: center; 
	}
	.feature-block {
		flex: 0 0 calc(50% - 20px);
		box-sizing: border-box;
		
		margin-right: 10px;
		min-height: auto;
		background: none;
		border: 2px solid #5e5e5e;
		min-height: 240px;
	}
	.feature-block:hover {
		border-color: #0099ff;
	}
</style>