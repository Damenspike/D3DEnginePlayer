<?php
	require_once("includes/pagetitles.php");
	require_once("client.php");
	
	if(!$page)
		$page = $_GET["page"];
	
	$pageparts = explode("/", $page);
	$page = $pageparts[0];
	
	if(!$page) {
		$page = "index";
	}
	if(!ctype_alnum($page) || !file_exists(__DIR__ . "/pages/$page.php")) {
		header('HTTP/1.0 404 Not Found');
		die(redirect("/404"));
	}
	if($page == "404") {
		header('HTTP/1.0 404 Not Found');
	}
	if($page == "403") {
		header('HTTP/1.0 403 Forbidden');
	}
	
	$title = $PAGE_TITLES[$page];
	$titleDetail = $PAGE_TITLES[implode("/", $pageparts)];
	$titleStr = "";
	
	if($titleDetail)
		$title = $titleDetail;
	
	if($title)
		$titleStr = "$title | ";
	
	$OP = $_GET["op"];
	
	if($OP) {
		include("pages/$page.php");
		die();
	}
?>

<html>
	<head>
		<title><?=$titleStr?>Damen3D Engine</title>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<meta name="title" content="<?=addslashes($title)?>Damen3D | Easy To Use Game Engine">
		<meta name="keywords" content="games, development, engineer, coding, game design, game development, game dev, 3d, 2d">
		<meta name="author" content="DRAKE HALL">
		<meta name="robots" content="index, follow">
		<meta name="distribution" content="global">
		<meta name="revisit-after" content="7 days">
		<meta name="rating" content="general">
		<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
		<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js"></script>
		
		<link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
		<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
		<link rel="shortcut icon" href="/favicon.ico" />
		<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
		<link rel="manifest" href="/site.webmanifest" />
		  
		<link rel="preconnect" href="https://fonts.googleapis.com">
		<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
		<link href="https://fonts.googleapis.com/icon?family=Material+Icons"
		  rel="stylesheet">
		  
		<!-- Adobe Fonts !-->
		<link rel="stylesheet" href="https://use.typekit.net/zoo4jqi.css">
		
		<script type="text/javascript">
			$(window).on('resize', function() { updateWindow(); });
			$(function() {
				updateWindow();
			});
			$(document).on('keydown', function(e) {
				// e.key might be "Escape" in modern browsers,
				// or check e.keyCode === 27 for broader support
				if (e.key === 'Escape' || e.keyCode === 27) {
					hideOverlayPage();
				}
			});
			
			function updateWindow() {
				var width = $(window).width(); // Also added missing parentheses after width
				var content = $('#content');
				
				if (width < 800) {
					$('#menu-bar-dt').hide();
					$('#menu-bar-mb').show();
					
					if(!content.hasClass('mob-content'))
						content.addClass('mob-content');
					
				} else {
					$('#menu-bar-dt').show();
					$('#menu-bar-mb').hide();
					
					if(content.hasClass('mob-content'))
						content.removeClass('mob-content');
				}
			}
			
			function pressBurger() {
				$('#menu-mb').toggle();
			}
			
			// Keep track of how many overlays have been opened 
			// (for stacking z-index)
			let overlayCounter = 1000; 
			
			var overlayIds = [];
			var overlaysByURL = [];
			
			/**
			 * Show a new overlay popup, loading content from the given `pageparts`.
			 */
			function showOverlayPage(pageparts, options = {}) {
				if(!pageparts)
					pageparts = [];
					
				if(pageparts.length < 1)
					return;
					
				const name = pageparts[0];
				const type = options.type ?? pageparts[1] ?? pageparts[0];
				const url  = '/' + pageparts.join('/') + '/?op=1';
				
				// Hide existing one to create new
				if(overlaysByURL[url]) {
					hideOverlayPage(overlaysByURL[url]);
				}else
				if(options.ifOpen) {
					return;
				}
			
				// Create a unique ID for this overlay
				const overlayId = 'op-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
			
				// Build the overlay HTML
				const overlayHtml = `
					<div id="${overlayId}" class="op op-type-${type}" style="z-index: ${overlayCounter}; display: none;">
						<div class="overlay-page" onclicktemp="hideOverlayPage('${overlayId}')">
							<div class="op-content op-content--${name}" onclick="event.stopPropagation();">
								<button class='op-close bl' onclick="hideOverlayPage('${overlayId}')">
									<i class="material-icons">close</i> 
								</button>
								<div class="op-html">Loading...</div>
							</div>
						</div>
					</div>
				`;
			
				// Append this new overlay to the body
				$('body').append(overlayHtml);
			
				// Fade it in
				$('#' + overlayId).fadeIn(100);
			
				// Increase overlayCounter so next overlay is higher
				overlayCounter++;
			
				// Perform AJAX to load the content into this overlay's .op-html
				$.ajax({
					url: url,
					type: 'GET',
					success: function(response) {
						$('#' + overlayId).find('.op-html').html(response);
					},
					error: function() {
						$('#' + overlayId).find('.op-html').html("Failed to load content. Please try again later.");
					}
				});
				
				overlayIds.push(overlayId);
				overlaysByURL[url] = overlayId;
			}
			
			/**
			 * Hide a specific overlay popup and remove it from the DOM.
			 */
			function hideOverlayPage(overlayId) {
				const $overlay = $('#' + (overlayId || overlayIds[overlayIds.length-1]));
				$overlay.fadeOut(100, function() {
					$overlay.remove();
				});
				overlayIds.pop();
				
				for(let overlayURL in overlaysByURL) {
					if(overlaysByURL[overlayURL] == overlayId) {
						overlaysByURL[overlayURL] = null;
					}
				}
			}
			function getOverlayMaybeOpen(urlLike) {
				for(let url in overlaysByURL) {
					if(url.indexOf(urlLike) > -1)
						return overlaysByURL[url];
				}
				return false;
			}
			
			updateWindow();
		</script>
		
		<?php
			include_once("assets/css/style.php");
		?>
	</head>
	<body>
		<div id="menu-mb" class="menu-mb">
			<div class='menu-mb__close clickable' onClick='pressBurger()'>
				<i class="material-icons">menu</i>
			</div>
			<div class="menu-mb__links">
				<?php
					include("includes/navigation_options.php");
				?>
			</div>
		</div>
		<div class="header header--<?=quote($page)?>">
			<div class="logo">
				<a href='/'>
					<img src="/assets/images/d3dlogowhite.png" class="no-select" />
				</a>
			</div>
			<div id="menu-bar-dt" class="menu-bar">
				<?php
					include("includes/navigation_options.php");
				?>
			</div>
			<div id="menu-bar-mb" class="menu-bar">
				<div class='clickable' onClick='pressBurger()'>
					<i class="material-icons">menu</i>
				</div>
			</div>
		</div>
		
		<div 
			id="content" 
			class="content-container content-container--<?=quote($page)?>"
		>
			<?php
				include("pages/$page.php");
			?>
		</div>
	</body>
	
	<footer>
		<div class="get-game">
			<div class="logo" style="padding-left: 0px;">
				<a href='/'><img src="/assets/images/d3dlogowhite.png" class="no-select" /></a>
				<a href='https://drakehall.co.uk'><img 
					src='https://drakehall.co.uk/assets/images/DrakeHallLogo512DarkMode.png?4' 
					class="no-select"
					style="width: 100px;"
				/></a>
			</div>
			
			<hr />
			
			<div class="mt2">
				
			</div>
		</div>
		
		<div class="attrib">
			<p>&copy; <?=date("Y")?> Damen3D Engine. Property of Drake Hall.</p>
			<p>
				<a href='/help'>Help</a> | 
				<a href='/terms'>Terms</a> | 
				<a href='/contact'>Contact</a> | 
				<a href='/credits'>Credits</a>
			</p>
		</div>
	</footer>
</html>