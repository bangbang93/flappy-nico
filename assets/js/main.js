/*
   Copyright 2014 Nebez Briefkani
   floppybird - main.js

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

var debugmode = false;

var states = Object.freeze({
   SplashScreen: 0,
   GameScreen: 1,
   ScoreScreen: 2,
   WaitingForServer: 3
});

var currentstate;

var gravity = 0.25;
var velocity = 0;
var position = 180;
var rotation = 0;
var jump = -4.6;

var score = 0;
var highscore = 0;

var replayclickable = false;

//sounds
var volume = 30;
var soundJump = new buzz.sound("sounds/sfx_wing.ogg");
var soundScore = new buzz.sound("sounds/sfx_point.ogg");
var soundHit = new buzz.sound("sounds/sfx_hit.ogg");
var soundDie = new buzz.sound("sounds/sfx_die.ogg");
var soundSwoosh = new buzz.sound("sounds/sfx_swooshing.ogg");
buzz.all().setVolume(volume);

//loops
var loopGameloop;
var loopPipeloop;

var socket;

$(document).ready(function() {
   if(window.location.search == "?debug")
      debugmode = true;
   if(window.location.search == "?easy")
      pipe_data_container.setEasyMode();
   
   //get the highscore
   var savedscore = getCookie("highscore");
   if(savedscore != "")
      highscore = parseInt(savedscore);
   
   //start with the splash screen
   showSplash();

   currentstate = states.WaitingForServer;

   var url = 'http://localhost:3700'
   socket = io.connect(url);

   socket.emit('register-request', null);

   socket.on('register-response', function(data) {
      alert(data);
      currentstate = states.SplashScreen;
   });

   socket.on('pipe-response', function(data) {
      var newpipe = $('<div class="pipe animated"><div class="pipe_upper" style="height: ' + data.topheight + 'px;"></div><div class="pipe_lower" style="height: ' + data.bottomheight + 'px;"></div></div>');
      $("#flyarea").append(newpipe);
      pipe_data_container.pushPipe(newpipe);
   });

   background_animation.endAnimations();
   
});

function getCookie(cname)
{
   var name = cname + "=";
   var ca = document.cookie.split(';');
   for(var i=0; i<ca.length; i++) 
   {
      var c = ca[i].trim();
      if (c.indexOf(name)==0) return c.substring(name.length,c.length);
   }
   return "";
}

function setCookie(cname,cvalue,exdays)
{
   var d = new Date();
   d.setTime(d.getTime()+(exdays*24*60*60*1000));
   var expires = "expires="+d.toGMTString();
   document.cookie = cname + "=" + cvalue + "; " + expires;
}

function showSplash()
{
   currentstate = states.SplashScreen;
   
   //set the defaults (again)
   velocity = 0;
   position = 180;
   rotation = 0;
   score = 0;
   
   //update the player in preparation for the next game
   $("#player").css({ y: 0, x: 0});
   updatePlayer($("#player"));
   
   soundSwoosh.stop();
   soundSwoosh.play();
   
   //clear out all the pipes if there are any
   $(".pipe").remove();
   pipe_data_container.clearPipes();
   
   //fade in the splash
   $("#splash").transition({ opacity: 1 }, 2000, 'ease');
}

function startGame()
{
   background_animation.startAnimations();
   

   currentstate = states.GameScreen;
   
   //fade out the splash
   $("#splash").stop();
   $("#splash").transition({ opacity: 0 }, 500, 'ease');
   
   //update the big score
   setBigScore();
   
   //debug mode?
   if(debugmode)
   {
      //show the bounding boxes
      $(".boundingbox").show();
   }

   //start up our loops
   var updaterate = 1000.0 / 60.0 ; //60 times a second
   loopGameloop = setInterval(gameloop, updaterate);
   loopPipeloop = setInterval(updatePipes, 1400);
   
   //jump from the start!
   playerJump();
}

function updatePlayer(player)
{
   //rotation
   rotation = Math.min((velocity / 10) * 90, 90);
   
   //apply rotation and position
   $(player).css({ rotate: rotation, top: position });
}

function gameloop() {
   var player = $("#player");
   
   //update the player speed/position
   velocity += gravity;
   position += velocity;
   
   //update the player 
   updatePlayer(player);
   
   //create the bounding box
   var box = document.getElementById('player').getBoundingClientRect();
   var origwidth = 34.0;
   var origheight = 24.0;
   
   var boxwidth = origwidth - (Math.sin(Math.abs(rotation) / 90) * 8);
   var boxheight = (origheight + box.height) / 2;
   var boxleft = ((box.width - boxwidth) / 2) + box.left;
   var boxtop = ((box.height - boxheight) / 2) + box.top;
   var boxright = boxleft + boxwidth;
   var boxbottom = boxtop + boxheight;
   
   //if we're in debug mode, draw the bounding box
   if(debugmode)
   {
      var boundingbox = $("#playerbox");
      boundingbox.css('left', boxleft);
      boundingbox.css('top', boxtop);
      boundingbox.css('height', boxheight);
      boundingbox.css('width', boxwidth);
   }
   
   //did we hit the ground?
   if(box.bottom >= $("#land").offset().top)
   {
      playerDead();
      return;
   }
   
   //have they tried to escape through the ceiling? :o
   var ceiling = $("#ceiling");
   if(boxtop <= (ceiling.offset().top + ceiling.height()))
      position = 0;
   
   //we can't go any further without a pipe
   if(pipe_data_container.getPipe(0) == null)
      return;
   
   //determine the bounding box of the next pipes inner area
   var nextpipe = pipe_data_container.getPipe(0);
   var nextpipeupper = nextpipe.children(".pipe_upper");
   
   var pipetop = nextpipeupper.offset().top + nextpipeupper.height();
   var pipeleft = nextpipeupper.offset().left - 2; // for some reason it starts at the inner pipes offset, not the outer pipes.
   var piperight = pipeleft + pipe_data_container.getPipeWidth();
   var pipebottom = pipetop + pipe_data_container.getPipeHeight();
   
   if(debugmode)
   {
      var boundingbox = $("#pipebox");
      boundingbox.css('left', pipeleft);
      boundingbox.css('top', pipetop);
      boundingbox.css('height', pipe_data_container.getPipeHeight());
      boundingbox.css('width', pipe_data_container.getPipeWidth());
   }
   
   //have we gotten inside the pipe yet?
   if(boxright > pipeleft)
   {
      //we're within the pipe, have we passed between upper and lower pipes?
      if(boxtop > pipetop && boxbottom < pipebottom)
      {
         //yeah! we're within bounds
         
      }
      else
      {
         //no! we touched the pipe
         playerDead();
         return;
      }
   }
   
   
   //have we passed the imminent danger?
   if(boxleft > piperight)
   {
      //yes, remove it
      pipe_data_container.removeUsedPipe();
      
      //and score a point
      playerScore();
   }
}

//Handle space bar
$(document).keydown(function(e){
   //space bar!
   if(e.keyCode == 32)
   {
      //in ScoreScreen, hitting space should click the "replay" button. else it's just a regular spacebar hit
      if(currentstate == states.ScoreScreen)
         $("#replay").click();
      else
         screenClick();
   }
});

//Handle mouse down OR touch start
if("ontouchstart" in window)
   $(document).on("touchstart", screenClick);
else
   $(document).on("mousedown", screenClick);

function screenClick()
{
   if(currentstate == states.GameScreen)
   {
      playerJump();
   }
   else if(currentstate == states.SplashScreen)
   {
      startGame();
   }
}

function playerJump()
{
   velocity = jump;
   //play jump sound
   soundJump.stop();
   soundJump.play();
}

function setBigScore(erase)
{
   var elemscore = $("#bigscore");
   elemscore.empty();
   
   if(erase)
      return;
   
   var digits = score.toString().split('');
   for(var i = 0; i < digits.length; i++)
      elemscore.append("<img src='images/font_big_" + digits[i] + ".png' alt='" + digits[i] + "'>");
}

function setSmallScore()
{
   var elemscore = $("#currentscore");
   elemscore.empty();
   
   var digits = score.toString().split('');
   for(var i = 0; i < digits.length; i++)
      elemscore.append("<img src='images/font_small_" + digits[i] + ".png' alt='" + digits[i] + "'>");
}

function setHighScore()
{
   var elemscore = $("#highscore");
   elemscore.empty();
   
   var digits = highscore.toString().split('');
   for(var i = 0; i < digits.length; i++)
      elemscore.append("<img src='images/font_small_" + digits[i] + ".png' alt='" + digits[i] + "'>");
}

function setMedal()
{
   var elemmedal = $("#medal");
   elemmedal.empty();
   
   if(score < 10)
      //signal that no medal has been won
      return false;
   
   if(score >= 10)
      medal = "bronze";
   if(score >= 20)
      medal = "silver";
   if(score >= 30)
      medal = "gold";
   if(score >= 40)
      medal = "platinum";
   
   elemmedal.append('<img src="images/medal_' + medal +'.png" alt="' + medal +'">');
   
   //signal that a medal has been won
   return true;
}

function playerDead()
{
   //stop animating everything!
   background_animation.endAnimations();
   
   //drop the bird to the floor
   var playerbottom = $("#player").position().top + $("#player").width(); //we use width because he'll be rotated 90 deg
   var floor = $("#flyarea").height();
   var movey = Math.max(0, floor - playerbottom);


   $("#player").transition({ y: movey + 'px', rotate: 90}, 1000, 'easeInOutCubic');
   
   //it's time to change states. as of now we're considered ScoreScreen to disable left click/flying
   currentstate = states.ScoreScreen;

   //destroy our gameloops
   clearInterval(loopGameloop);
   clearInterval(loopPipeloop);
   loopGameloop = null;
   loopPipeloop = null;

   pipe_data_container.resetIndex();

   //mobile browsers don't support buzz bindOnce event
   if(isIncompatible.any())
   {
      //skip right to showing score
      showScore();
   }
   else
   {
      //play the hit sound (then the dead sound) and then show score
      soundHit.play().bindOnce("ended", function() {
         soundDie.play().bindOnce("ended", function() {
            showScore();
         });
      });
   }
}

function showScore()
{
   //unhide us
   $("#scoreboard").css("display", "block");
   
   //remove the big score
   setBigScore(true);
   
   //have they beaten their high score?
   if(score > highscore)
   {
      //yeah!
      highscore = score;
      //save it!
      setCookie("highscore", highscore, 999);
   }
   
   //update the scoreboard
   setSmallScore();
   setHighScore();
   var wonmedal = setMedal();
   
   //SWOOSH!
   soundSwoosh.stop();
   soundSwoosh.play();
   
   //show the scoreboard
   $("#scoreboard").css({ y: '40px', opacity: 0 }); //move it down so we can slide it up
   $("#replay").css({ y: '40px', opacity: 0 });
   $("#scoreboard").transition({ y: '0px', opacity: 1}, 600, 'ease', function() {
      //When the animation is done, animate in the replay button and SWOOSH!
      soundSwoosh.stop();
      soundSwoosh.play();
      $("#replay").transition({ y: '0px', opacity: 1}, 600, 'ease');
      
      //also animate in the MEDAL! WOO!
      if(wonmedal)
      {
         $("#medal").css({ scale: 2, opacity: 0 });
         $("#medal").transition({ opacity: 1, scale: 1 }, 1200, 'ease');
      }
   });
   
   //make the replay button clickable
   replayclickable = true;
}

$("#replay").click(function() {
   //make sure we can only click once
   if(!replayclickable)
      return;
   else
      replayclickable = false;
   //SWOOSH!
   soundSwoosh.stop();
   soundSwoosh.play();
   
   //fade out the scoreboard
   $("#scoreboard").transition({ y: '-40px', opacity: 0}, 1000, 'ease', function() {
      //when that's done, display us back to nothing
      $("#scoreboard").css("display", "none");
      
      //start the game over!
      showSplash();
   });
});

function playerScore()
{
   score += 1;
   //play score sound
   soundScore.stop();
   soundScore.play();
   setBigScore();
}

function updatePipes()
{
   //Do any pipes need removal?
   $(".pipe").filter(function() { return $(this).position().left <= -100; }).remove()

   socket.emit('pipe-request', {
      index: pipe_data_container.getAndIncrementPipeIndex()
   });
}

var isIncompatible = {
   Android: function() {
   return navigator.userAgent.match(/Android/i);
   },
   BlackBerry: function() {
   return navigator.userAgent.match(/BlackBerry/i);
   },
   iOS: function() {
   return navigator.userAgent.match(/iPhone|iPad|iPod/i);
   },
   Opera: function() {
   return navigator.userAgent.match(/Opera Mini/i);
   },
   Safari: function() {
   return (navigator.userAgent.match(/OS X.*Safari/) && ! navigator.userAgent.match(/Chrome/));
   },
   Windows: function() {
   return navigator.userAgent.match(/IEMobile/i);
   },
   any: function() {
   return (isIncompatible.Android() || isIncompatible.BlackBerry() || isIncompatible.iOS() || isIncompatible.Opera() || isIncompatible.Safari() || isIncompatible.Windows());
   }
};