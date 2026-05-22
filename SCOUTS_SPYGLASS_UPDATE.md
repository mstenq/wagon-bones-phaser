## scouts_spyglass

currently the scouts_spyglass gives you a preview of the trail event categories. Instead I want to display just an image previewing what the even might be as if seen through a spyglass. The idea would be to use the public/assets/trail-event-spy/ directory to show full screen images with a black matte overtop with a circle cutout that can be moved across the image as if you were controlling a spy glass looking at the scene. If phaser can handle distortion to make it look like you are looking through glass that would be cool. 

So you see the preview and from there you can choose to do one of the following:
 - Avoid
 - Investigate (Gain +20 miles)

Currently its the opposite and you get miles added to the card for avoiding, but I want to swap that and make it so you only get bonus miles when you investigate since that seems more fun (More risk/more reward). Also only 20 miles as 50 miles would scale way too quickly.

Currently everything is handled in TrailEventScene.ts, but we may want to seperate this out into its own Scene.

## Testing
- Since images are gonna be super important, lets add tests to make sure that each trail event id has a cooresponding trail-event and trail-event-spy image (Same id name).
- Test that it works in general and that cards scaling works properly.

