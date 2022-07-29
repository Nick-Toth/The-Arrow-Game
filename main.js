
/* ***********************************************************************************************
// This file contains all of the javascript code for The Arrow Game.
// 
// Components of interest:
//   - There are four drag listeners. Two for mobile browsers, and two for desktop browsers.
//     Each of these pairs of listeners consists of a listener for dragging new arrows from the
//     next_arrow element into the grid, and another for dragging arrows within the grid. These
//     listeners are: addMobileGridListener, addDesktopGridListener, addArrowMobileListener, and
//     addArrowDesktopListener.
//
//   - Most of the game logic is handled by handleAction, classifyAction, applyActionGravity, and
//     endGameCheck.  The active grid listener calls call handleAction when the user attemts a grid
//     action. handleAction calls classifyAction to determine whether the action is valid and what
//     kind of action to perform (from Combine, Cancel, and Merge). If the action is invalid, then
//     the grid and next arrows are left unchanged. If the action is valid, then handleAction
//     updates the grid and applies applyActionGravity in the columns where arrows are removed.
//     There's more information about applyActionGravity below. endGameCheck simply determines
//     whether or not any further progress is possible, and opens the game over screen if it's not.
// 
//   - There are numerous small animations that are easy to locate and change if desired, such as
//     cell highlighting, next_arrow blinking, and hiding/revealing the game over menu. But the
//     main animation to be aware of is gravity. When we talk about gravity, we are talking about
//     the animation that translates arrows to the lowest empty cell in their column. This
//     happens whenever a new arrow is dropped into the grid and whenever an action creates
//     gaps in the grid. Independently, these cases are simple. To keep it that way, we have
//     imposed the rule that only one gravity animation can take place in each column at a time.
//     As long as the animations are fast enough, this isn't too annoying. However, it's obviously
//     a mediocre solution. Ideally we would implement a less restrictive gravity animation.
//
//     When an arrow is dropped into the grid, gravity is broken up into at most four sequential
//     applications (depending on what is beneath the arrow at each step) of a static animation
//     from any cell (outside of the bottom row) to the cell below. See applyGravitySteps.
//
//     When an arrow is removed from the grid, applyActionGravity applies applyGravitySteps
//     to each of the cells above the removed cell.
//
//   - See $(document).ready( ... ) for initialization.
//   - See window.mobileCheck = function(){ ... } for handling mobile vs desktop content.
//
//
// Things that might be nice:
//    - A better gravity animation.
//    - grid-action animations. e.g. exploding cancellation, gradual and continuous combining/merging.
//    - Managing the game logic on the back end. It is currently overwhelmingly easy to cheat.
//      Honestly, this doesn't bother me at all. Furthermore, why stress the server? There also a
//      few debugging tools that can easily be used to manipulate the game.
//
// *********************************************************************************************** */

// Game fields.
let [next_arrow, next_next_arrow] = [null, null],
    spins_remaining = 3,
    score = 0,
    animating_columns = [],
    arrows_placed = 0,
    do_debug = false;

let arrow_color = "blue";
const cell_highlighting_color = "gold";

/* ************************************************************************************* */
// Various small utilities.

let sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)), // This is half of the animation duration, but I think it looks nicer this way.
    button_sleep = () => sleep(150), // This is half of the animation duration, but I think it looks nicer this way.
    remove_element = (list,elem) => list.filter(x => x !== elem)

let arrow_path = (arrow_id, color=arrow_color) => "url('./resources/" + color + "-arrows-128/" + arrow_id.toString() + ".png')",
    grid_id = (i,j) => i*5+j,
    grid_indices = (n) => [(n-(n%5))/5, n%5],get_grid_cell = (i,j) => document.getElementById("cell" + grid_id(i,j).toString()),
    cell_in_gravity_range = (i,j) => i >= 0 && i <= 4 && j >= 0 && j <= 4,
    can_be_dropped_to = (i,j) => { if(!cell_in_gravity_range(i,j)){return false} else {return ((c_stat => c_stat === "0") (get_grid_cell(i,j).dataset.status)) }}

/* ************************************************************************************* */
// Animation definitions.

const gravity_duration = 300, // ms. If changing, also change the duration in the gravity keyframe animation, too. 300 is good.
      landing_duration = 100;

const hide = [
  { opacity: "1", },
  { opacity: "0", },
]

const show = [
  { opacity: "0", },
  { opacity: "1", },
]

const landing = [
  { transform: "scale(1.15)", },
  { transform: "scale(0.9)", },
  { transform: "scale(1)", },
]

// I was originally animating with translateY, but for some reason this
// looks bumpier than animating with marginTop. marginTop still doesn't
// look perfect, but the translateY animation looks like hot garbage.
//let anim = r => [ { transform: 'translateY(' + (anim_height*r).toString() + 'px)' }, { transform: 'translateY('+ (anim_height*(r+1)).toString() +'px)' }]
// And animating top looks better than animating marginTop
//let anim = r => [ { marginTop: (anim_height*(r-1)).toString() + 'px' }, { marginTop: (anim_height*(r)).toString() + 'px' } ]
const anim_height = 61,
      anim = r => [
        { top: (anim_height*(r)).toString() + 'px' },
        { top: (anim_height*(r+1)).toString() + 'px' } ]

/* ************************************************************************************* */


/* **************************************************
// Returns a number representing on of the most basic
// arrows (those pointing in one direction).
//
// This is used for the new arrow generator.
// ************************************************** */
function getRandomArrow( valid_numbers = [1,2,3,4,5,7,8,10]
){
  let rand = Math.random(),
      rand_arrow_id = 7;

  for(var i = 1; i < 8; i += 1)
  { if(rand < i/8){ rand_arrow_id = i-1; break } }
  return valid_numbers[rand_arrow_id]
}


/* *******************************************************
// Places the preview arrow into the next arrow container,
// and replaces the preview with a freshly generated
// random arrow.
// ******************************************************* */
function updateNextArrows(
){
  let next_arrow_div = document.getElementById("next_arrow"),
      next_next_arrow_div = document.getElementById("next_next_arrow");

  next_arrow = next_next_arrow === null? getRandomArrow() : next_next_arrow;
  next_next_arrow = getRandomArrow()

  next_arrow_div.dataset.status = next_arrow
  next_arrow_div.style.backgroundImage = arrow_path(next_arrow)
  next_next_arrow_div.style.backgroundImage = arrow_path(next_next_arrow)
}


/* ***************************************************
// Swaps the next arrow and next next arrow (preview).
// This is used by the swap button.
// *************************************************** */
function swapNextArrows(
){
  if( spins_remaining === 0 ){ return false; }
  --spins_remaining;

  document.getElementById("swap-label").innerHTML = spins_remaining.toString()

  let next_arrow_div = document.getElementById("next_arrow"),
      next_next_arrow_div = document.getElementById("next_next_arrow");

  temp = next_arrow
  next_arrow = next_next_arrow
  next_next_arrow = temp

  next_arrow_div.dataset.status = next_arrow
  next_arrow_div.style.backgroundImage = arrow_path(next_arrow)
  
  next_next_arrow_div.style.backgroundImage = arrow_path(next_next_arrow)
}

/* ************************************************************************************* */


/* **************************************************
// Places a given arrow into cell (i,j).
// ************************************************** */
function updateGridCell( i, j // Grid indices of the cell being updated.
                       , content // A number representing the arrow being placed.
){
  if(animating_columns.includes(j)){ return false }
  // A new arrow was dragged to this cell.
  let grid_cell_id = "cell" + grid_id(i,j).toString(),
      grid_cell = document.getElementById(grid_cell_id);

  grid_cell.dataset.status = content
  grid_cell.style.backgroundImage = arrow_path(content)

  return true
}


/* **************************************************
// Inserts a given arrow into cell (i,j), and applies
// gravity to that cell.
// ************************************************** */
function insertNewArrow( i, j // Grid indices of the cell being updated.
                       , content // A number representing the arrow being placed.
){
  if(animating_columns.includes(j)){ return false }

  // A new arrow was dragged to this cell.
  let grid_cell_id = "cell" + grid_id(i,j).toString(),
      grid_cell = document.getElementById(grid_cell_id);

  // If no such cell exists or the cell isn't empty, then reject the update.
  if( i < 0 || j < 0 || i > 4 || j > 4) {return false }
  if(grid_cell.dataset.status !== "0") { return false }

  grid_cell.dataset.status = content
  grid_cell.style.backgroundImage = arrow_path(content)

  if(!applyGravitySteps(i, j)) {landingAnimation(grid_cell, () => {});}
  return true
}


/* ******************************************************
// Whenever a gravity animation takes place, we create
// a new json object containing information about the
// animation. In particular, the original cell, the cell
// below, and an animated clone of the original cell.
// ****************************************************** */
function getAnimationEnvironment( i, j // Grid indices of the cell being animated from.
){
  // Make sure that animating i, j even makes sense in the first place.
  if(!cell_in_gravity_range(i,j)){ return {}; }

  // Make sure that the cell in the next row is not full.
  if(!can_be_dropped_to(i+1,j)){ return {}; }

  // Once we know that the animation will be performed, record the animation column to
  // prevent the user from performing actions in that column until the animation is complete.
  if(!animating_columns.includes(j)) {animating_columns.push(j)} // Removed in updateEnvironmentPostAnimation

  // This is the cell that we want to apply gravity to.
  let cell = get_grid_cell(i,j),
      next_cell = get_grid_cell(i+1,j),
      content = cell.dataset.status
      anim_env = { 'cell' : cell
                 , 'next_cell' : next_cell
                 , 'content': content
                 , 'cell_index' : [i,j] }

  anim_env["cell"].dataset.status = '0'//"animatingfrom"
  anim_env["next_cell"].dataset.status = "animatingto"
  anim_env["clone"] = cloneCell(anim_env, i)

  return anim_env
}


/* **************************************************
// Builds/styles of a clone of the original cell for
// some animation environment.
// ************************************************** */
function cloneCell( anim_env
,                   row
){
  const clone = document.createElement('div');
  clone.classList.add('cell')
  clone.dataset.status = anim_env["content"]
  clone.dataset.origin = anim_env["cell"].dataset.origin

  //const clone = anim_env["cell"].cloneNode(true)
  clone.style.zIndex = 1
  clone.style.position = 'absolute'
  clone.style.top = (60*(row+1)).toString() + "px"
  //clone.style.marginLeft = "-0.25px" // This seems weird, but it looks right. I guess you can divide pixels these days.
  clone.style.left = "3px"
  clone.style.width = "53px"
  clone.style.height = "53px"
  //clone.style.backgroundColor = "orange"
  clone.style.backgroundImage = arrow_path(anim_env["content"])//, "orange")
  clone.style.animationFillMode = "forwards";

  anim_env["cell"].parentElement.appendChild(clone);
  anim_env["cell"].style.backgroundImage = "none"

  return clone
}


/* **************************************************
// Updates an animation environment between gravity
// animation steps.
// ************************************************** */
function updateEnvironmentMidAnimation( anim_env
){
  anim_env["cell"].dataset.status = "0"

  let new_row = anim_env["cell_index"][0]+1,
      same_col = anim_env["cell_index"][1],
      cell = get_grid_cell(new_row,same_col),
      next_cell = get_grid_cell(new_row+1,same_col);

  next_cell.dataset.status = "animatingto"
  cell.dataset.status = '0'//"animatingfrom"

  anim_env = { 'cell' : cell
             , 'next_cell' : next_cell
             , 'content': anim_env["content"]
             , 'cell_index' : [new_row,same_col]
             , 'clone' : anim_env["clone"] }

  return anim_env
}


/* **************************************************
// Updates an animation environment when a gravity
// animation has been completed.
// ************************************************** */
function updateEnvironmentPostAnimation( anim_env
                                       , mu // For positioning the clone to hide the blinking at the end of the animation. Equal to 61*(i+3)
){
  anim_env["clone"].style.top = mu.toString() + 'px'

  if(animating_columns.includes(anim_env['cell_index'][1])) // It should, by the way.
  { animating_columns = remove_element(animating_columns, anim_env['cell_index'][1]) }

  if(anim_env["next_cell"].dataset.status === "animatingto"){
    //anim_env["next_cell"].dataset.status = anim_env["content"]
    updateGridCell(anim_env["cell_index"][0]+1, anim_env["cell_index"][1], anim_env["content"])
  }

  if(anim_env["cell"].dataset.status === "0")
  {
    anim_env["cell"].dataset.status = "0"
    anim_env["cell"].style.backgroundImage = "none"
  }

  landingAnimation(anim_env["clone"], () => anim_env["clone"].remove())
}


/* **************************************************
// Animates the 'landing' of a cell at the end of a
// gravity animation.
// ************************************************** */
function landingAnimation( object_to_animate // e.g. a cell clone.
                         , do_after_landing // A function containing post-animation behavior. e.g. removing the clone.
){
  // Just a slight correction. This could be moved to a more appropriate location. i.e. the grid cell clone styling function.
  object_to_animate.style.left = "3px";
  object_to_animate.style.marginTop = "0.25px";

  var landing_anim = object_to_animate.animate(landing, landing_duration);
  landing_anim.finished.then(do_after_landing)
}


/* **************************************************
// Applies a gravity transformation / animation to
// grid cell (i,j).
// ************************************************** */
function applyGravitySteps( i, j
){
  // Create a new animation environment.
  let anim_env = getAnimationEnvironment(i,j)
  if(Object.keys(anim_env).length === 0){ return false }

  // Perform the first gravity step.
  var anim_1 = anim_env["clone"].animate(anim(0+i), gravity_duration);
  anim_1.finished.then( () =>
  {
    // If cell (i, j) has not reached its final destination, then we continue applying gravity and
    // checking, and so on, until we are sure that (i, j) has reached the lowest cell in the column.
    if(can_be_dropped_to(i+2,j)){
      // Updates the animation environment
      anim_env = updateEnvironmentMidAnimation(anim_env)
      // Performs another gravity step.
      var anim_2 = anim_env["clone"].animate(anim(1+i), gravity_duration);
      return anim_2.finished.then( () =>
      {
        if(can_be_dropped_to(i+3,j)) {
          anim_env = updateEnvironmentMidAnimation(anim_env)
          var anim_3 = anim_env["clone"].animate(anim(2+i), gravity_duration);
          return anim_3.finished.then( () =>
          {
            if(can_be_dropped_to(i+4,j)) {
              anim_env = updateEnvironmentMidAnimation(anim_env)
              var anim_4 = anim_env["clone"].animate(anim(3+i), gravity_duration);
              return anim_4.finished.then( () =>
              {
                updateEnvironmentPostAnimation(anim_env,anim_height*4) // Finished gravity application after four steps.
              })
            }
            else { updateEnvironmentPostAnimation(anim_env,anim_height*(i+3)) } // Finished gravity application after three steps.
          })
        }
        else { updateEnvironmentPostAnimation(anim_env,anim_height*(i+2)) } // Finished gravity application after two steps.
      })
    }
    else { updateEnvironmentPostAnimation(anim_env,anim_height*(i+1)) } // Finished gravity application after one step.
  })
}


/* **************************************************
// Applies a gravity transformation / animation to
// grid cell (i,j) after an action in the grid (as
// opposed to dropping a new cell into the grid).
// ************************************************** */
function applyActionGravity( i, j
){
  // Make sure that animating i,j even makes sense in the first place.
  if(i < 0 || j < 0 || i >= 4 || j > 4) { return false }

  // This is the cell that we want to apply gravity to.
  let grid_cell_id = "cell" + grid_id(i,j).toString(),
      grid_cell = document.getElementById(grid_cell_id),
      status = grid_cell.dataset.status.toString();

  // If cell i,j has no content, then return. "We can only animate that which exists." - Nietzsche.
  if(status === "0" || grid_cell.dataset.status === "animatingto") { return false }

  // This case is possible, but we should treat it as we do the case when grid_cell.dataset.status === "0".
  //if(grid_cell.dataset.status === "animatingto" ) { grid_cell.style.opacity=1; landingAnimation(grid_cell, () => {}); return false }

  // Apply gravity to the current cell.
  applyGravitySteps(i, j)

  // And attempt to apply gravity to the cell above.
  applyActionGravity(i-1,j)
}

/* ************************************************************************************* */
// New arrow drag event


/* **************************************************
// Clones the next arrow for a drag animation.
// ************************************************** */
function cloneNextArrow(
){
  let na = document.getElementById('next_arrow')
  const na_clone = na.cloneNode(true)
  document.body.append(na_clone);
  na.style.opacity = "0";
  na_clone.style.position = 'absolute';
  na_clone.style.zIndex = 1;
  na_clone.style.width = "60px";
  na_clone.style.height = "60px";

  return na_clone
}


/* **************************************************
// Adds and removes cell highlighting as a user drags
// new arrows around the grid.
// ************************************************** */
function updateCellHighlighting( x, y // User's touch location.
                               , last_hovered_grid_cell
){
  // Determine if the location (x,y) corresponds to a grid cell.
  if(1 <= x && x <= 299 && 1 <= y && y<=299)
  {
    let cell_i = Math.floor(y/60), cell_j = Math.floor(x/60),
        grid_cell_container_id = "cell_container" + grid_id(cell_i,cell_j).toString();

    // Resets cells that are no longer being hovered over.
    if(last_hovered_grid_cell !== "") { document.getElementById(last_hovered_grid_cell).style.borderColor = "#222" }
    
    // Highlight the hovered cell.
    if(!arrows.includes(parseInt(document.getElementById( "cell" + grid_id(cell_i,cell_j).toString()).dataset.status)))
    {
      document.getElementById(grid_cell_container_id).style.borderColor = cell_highlighting_color;
      last_hovered_grid_cell = grid_cell_container_id
    }
  }
  // Turns off cell highlighting when the user is not longer touching in the grid.
  else if(last_hovered_grid_cell !== "") { document.getElementById(last_hovered_grid_cell).style.borderColor = "#222"; last_hovered_grid_cell = "" }

  // Record the currently highlighted cell so that we can remove the highlighting later.
  return last_hovered_grid_cell
}


/* **************************************************
// Creates a drag listener for desktop browsers on the
// next_arrow element so that the user can drag and
// drop new arrows into the grid.
// ************************************************** */
function addArrowDesktopListener( e
){
  let na = document.getElementById('next_arrow')
  const na_clone = cloneNextArrow()
  
  function moveTo(pageX, pageY) { na_clone.style.left = pageX - na_clone.offsetWidth / 2 + 'px'; na_clone.style.top = pageY - na_clone.offsetHeight / 2 + 'px';}
  moveTo(e.pageX, e.pageY);

  let rect = document.getElementById('ag_grid').getBoundingClientRect();
  let last_hovered_grid_cell = "";

  function onMouseMove(e2)
  {
    let [x,y] = [e2.clientX - rect.left, e2.clientY - rect.top]

    // Update cell highlighting.
    last_hovered_grid_cell = updateCellHighlighting(x,y,last_hovered_grid_cell)
    moveTo(e2.pageX, e2.pageY);
  }

  document.addEventListener('mousemove', onMouseMove);

  na_clone.onmouseup = function(e3) {

    let [x,y] = [e3.clientX - rect.left, e3.clientY - rect.top]

    if(last_hovered_grid_cell !== "") { document.getElementById(last_hovered_grid_cell).style.borderColor = "#222" }

    if(1 <= x && x <= 299 && 1 <= y && y<=299)
    {
      let cell_i = Math.floor(y/60), cell_j = Math.floor(x/60)
      var drop_successful = insertNewArrow(cell_i, cell_j, na.dataset.status)
      if(drop_successful)
      { updateNextArrows(); ++arrows_placed; if(arrows_placed === 25){endGameCheck()} }
    }
    document.removeEventListener('mousemove', onMouseMove);
    na_clone.onmouseup = null;

    na_clone.remove();

    na.style.opacity = "1";
  };
}


/* **************************************************
// Creates a drag listener for mobile browsers on the
// next_arrow element so that the user can drag and
// drop new arrows into the grid.
// ************************************************** */
function addArrowMobileListener( e
){
  e.preventDefault();

  let na = document.getElementById('next_arrow')
  const na_clone = cloneNextArrow()
  
  var t = e.touches[0] || e.changedTouches[0];
  const [origin_x, origin_y] = [t.clientX, t.clientY]

  moveTo(origin_x, origin_y + document.documentElement.scrollTop)//moveTo(t.clientX, t.clientY);

  // Centering.
  function moveTo(pageX, pageY) { na_clone.style.left = pageX - na_clone.offsetWidth / 2 + 'px'; na_clone.style.top = pageY - na_clone.offsetHeight / 2 + 'px';}

  let last_hovered_grid_cell = ""

  let getTouchCoords = e => (((t, rect) => [t, t.clientX - rect.left, t.clientY - rect.top])(e.touches[0] || e.changedTouches[0], document.getElementById('ag_grid').getBoundingClientRect()))

  function onMouseMove(e2)
  {
    // t2 is a touch object. x and y are the coordinates of the touch.
    let [t2,x,y] = getTouchCoords(e2)

    // Update cell highlighting.
    last_hovered_grid_cell = updateCellHighlighting(x,y,last_hovered_grid_cell)

    moveTo(t2.clientX,t2.clientY + document.documentElement.scrollTop);
  }

  
  document.addEventListener('touchmove', onMouseMove, false);

  function X(e3)
  {
    e3.preventDefault();

    // t3 is a touch object. x and y are the coordinates of the touch.
    let [t3,x,y] = getTouchCoords(e3)

    if(last_hovered_grid_cell !== "") { document.getElementById(last_hovered_grid_cell).style.borderColor = "#222" }

    if(1 <= x && x <= 299 && 1 <= y && y<=299)
    {
      let cell_i = Math.floor(y/60), cell_j = Math.floor(x/60)
      var drop_successful = insertNewArrow(cell_i, cell_j, na.dataset.status)
      if(drop_successful) { updateNextArrows(); ++arrows_placed; if(arrows_placed === 25){endGameCheck()} }
    }

    //na.removeEventListener('touchmove', onMouseMove);
    na.style.opacity = "1";

    document.removeEventListener('touchmove', onMouseMove);
    na_clone.remove();

    na.removeEventListener('touchend', X)
  }

  na.addEventListener('touchend', X, false);
}


/* ************************************************************************************* */


/* **************************************************
// This function should only be called from the
// grid listener, unless you're really sure there
// won't be side effects.
// ************************************************** */
function handleAction( cell, cell_clone, x, y
){
  if(1 <= x && x <= 299 && 1 <= y && y<=299)
  {
    let cell_i = Math.floor(y/60), cell_j = Math.floor(x/60)
    if(animating_columns.includes(cell_j) || animating_columns.includes(parseInt(cell_clone.dataset.origin % 5))){ cell.style.opacity = "1"; cell_clone.remove(); return -1; } 

    let src_content = parseInt(cell_clone.dataset.status),
        dest_content = parseInt(document.getElementById("cell" + grid_id(cell_i,cell_j)).dataset.status),
        new_src_content = null, new_dest_content = null,
        origin = grid_indices(cell_clone.dataset.origin),
        action_dist = grid_id(cell_i,cell_j)-cell_clone.dataset.origin;

    if(!resolveEdgeError(origin, [cell_i,cell_j], action_dist))
    { cell.style.opacity = "1"; cell_clone.remove(); return -1 }

    // Determine what action, if any, can be performed on the source and dest cells.
    let action = classifyAction(src_content, dest_content, action_dist)
    
    if(do_debug){ console.log("ACTION: ", action) }

    // Relates the arrow type to the score. The actual score depends on the arrow type as well as the action type.
    let u = basic_arr.includes(src_content)? 2 : mid_arr.includes(src_content)? 4 : src_content === 40 ? 9 : 6;

    switch(action)
    {
      case Merge:
        if(do_debug){ console.log("Merge: [source, dest] = ", [src_content, dest_content]) }
        score += 2
        new_src_content = 0
        new_dest_content = src_content
        --arrows_placed;
        break

      case Combine:
        if(do_debug){ console.log("Combine: [source, dest] = ", [src_content, dest_content]) }
        score += 2**(u+1);
        new_src_content = 0
        new_dest_content = (src_content + dest_content) % 80
        --arrows_placed
        break

      case Cancel:
        if(do_debug){ console.log("Cancel: [source, dest] = ", [src_content, dest_content]) }

        // Cancel two maxed arrows.
        if(src_content + dest_content === 80)
        { spins_remaining += 1; document.getElementById("swap-label").innerHTML = spins_remaining.toString(); }
        // Other types of cancels:
        score += 2**(u) + 2;

        new_src_content = 0
        new_dest_content = 0
        arrows_placed -= 2
        break

      default:
        cell_clone.remove();
        cell.style.opacity = "1";
        return -1;
    }
    
    if(do_debug){ console.log("origin[0], origin[1], new_src_content = ", [origin[0], origin[1], new_src_content]) }

    updateGridCell(origin[0], origin[1], new_src_content)
    updateGridCell(cell_i, cell_j, new_dest_content)

    // This might cause some issues, but it makes the animations more consistent.
    // If it does cause problems, there's really no harm in removing it. Low priority.
    let cell2 = document.getElementById("cell" + grid_id(cell_i,cell_j))
    cell.style.opacity=1; landingAnimation(cell, () => {});
    cell2.style.opacity=1; landingAnimation(cell2, () => {});


    // Handle the cases where two rows are deleted from the same column.
    if(src_content === 1 && dest_content === 5 && action_dist === -5)
    { applyActionGravity(cell_i-1, cell_j); }
    else if(src_content === 5 && dest_content === 1 && action_dist === 5)
    { applyActionGravity(origin[0]-1, origin[1]);}
    else
    {
      // Handle removal of the source arrow.
      if(new_src_content === 0)
      { applyActionGravity(origin[0]-1, origin[1]) }

      // Handle removal of the dest arrow.
      if(new_dest_content === 0)
      { applyActionGravity(cell_i-1, cell_j) }
    }
  }
  document.getElementById("score").innerHTML = score.toString()
  cell_clone.remove();
  cell.style.opacity = "1";
}


/* *********************************************************
// Creates a listener for grid actions on desktop browsers.
// Whenever a non-empty grid cell is touched, its content
// is made invisible, and a draggable clone of its content
// is created. When the drag ends, handleAction is called
// on the cell that was dragged from and the cell that was
// dragged to (if such a cell exists). 
// ********************************************************* */
function addDesktopgridListener(
){
  storeCellIds()
  document.getElementById('ag_grid').onmousedown = function(e1) {

    e1.preventDefault();

    let rect = document.getElementById('ag_grid').getBoundingClientRect();
    let [x,y] = [e1.pageX - rect.left, e1.pageY - rect.top + document.documentElement.scrollTop];

    // Check if the user has touched a cell.
    if(1 > x || x > 299 || 1 > y || y>299)
    { return; }
  
    // Determine the touched cell.
    let cell_i = Math.floor(y/60), cell_j = Math.floor(x/60),
        touched_cell_id = "cell" + grid_id(cell_i,cell_j).toString()
    touched_cell = document.getElementById(touched_cell_id);

    const cell_clone = touched_cell.cloneNode(true)
    document.body.append(cell_clone);

    touched_cell.style.opacity = "0";

    cell_clone.style.position = 'absolute';
    cell_clone.style.width = "60px";
    cell_clone.style.height = "60px";
    cell_clone.style.marginLeft = "-1px"
    cell_clone.style.marginTop = "3px"

    function moveTo(pageX, pageY){ cell_clone.style.left = pageX - cell_clone.offsetWidth / 2 + 'px'; cell_clone.style.top = pageY - cell_clone.offsetHeight / 2 + 'px';}
    moveTo(e1.pageX, e1.pageY);

    function onMouseMove(e) { moveTo(e.pageX, e.pageY); }
    document.addEventListener('mousemove', onMouseMove);

    cell_clone.onmouseup = function(e)
    {
      document.removeEventListener('mousemove', onMouseMove);
      cell_clone.onmouseup = null;

      let rect = document.getElementById('ag_grid').getBoundingClientRect(),
          x2 = e.clientX - rect.left,
          y2 = e.clientY - rect.top;

      handleAction(touched_cell, cell_clone, x2, y2)
    };
  };
}



/* *********************************************************
// Creates a listener for grid actions on mobile browsers.
// Whenever a non-empty grid cell is touched, its content
// is made invisible, and a draggable clone of its content
// is created. When the drag ends, handleAction is called
// on the cell that was dragged from and the cell that was
// dragged to (if such a cell exists). The desktop version
// works in mostly the same way.
// ********************************************************* */
function addMobileGridListener(
){
  storeCellIds()
  document.getElementById('ag_grid').addEventListener('touchstart', e1 => {

    e1.preventDefault();

    let rect = document.getElementById('ag_grid').getBoundingClientRect();
    var t = e1.touches[0] || e1.changedTouches[0];
    let [x,y] = [t.clientX - rect.left, t.clientY - rect.top + document.documentElement.scrollTop];

    // Check if the user has touched a cell.
    if(1 > x || x > 299 || 1 > y || y>299) { return; }
  
    // Determine the touched cell.
    let cell_i = Math.floor(y/60), cell_j = Math.floor(x/60),
        touched_cell_id = "cell" + grid_id(cell_i,cell_j).toString()
    touched_cell = document.getElementById(touched_cell_id);

    const cell_clone = touched_cell.cloneNode(true)
    document.body.append(cell_clone);

    touched_cell.style.opacity = "0";

    cell_clone.style.position = 'absolute';
    cell_clone.style.width = "60px";
    cell_clone.style.height = "60px";
    cell_clone.style.marginLeft = "-1px"
    cell_clone.style.marginTop = "3px"

    function moveTo(pageX, pageY){ cell_clone.style.left = pageX - cell_clone.offsetWidth / 2 + 'px'; cell_clone.style.top = pageY - cell_clone.offsetHeight / 2 + 'px';}
    moveTo(t.clientX, t.clientY);

    function onTouchMove(e2) { let t2 = e2.touches[0] || e2.changedTouches[0]; moveTo(t2.clientX, t2.clientY);  }
    document.addEventListener('touchmove', onTouchMove)

    function X(e3)
    {
      document.removeEventListener('touchmove', onTouchMove)

      var t3 = e3.touches[0] || e3.changedTouches[0];
      let rect = document.getElementById('ag_grid').getBoundingClientRect(),
          [x2,y2] = [t3.clientX - rect.left, t3.clientY - rect.top + document.documentElement.scrollTop]

      handleAction(touched_cell, cell_clone, x2, y2)
      document.getElementById('ag_grid').removeEventListener('touchend', X)
    }

    //console.log("added touch end event.")
    document.getElementById('ag_grid').addEventListener('touchend', X)
  })
}


// Stores a unique id in each grid cell.
// The id of cell (i,j) is i*5+j.
function storeCellIds(
){
  // Store the id of each cell in that cell.
  for(var i = 0; i < 25; i++) {
    let cell = document.querySelector('#cell' + i.toString())
    cell.dataset.origin = i
  }
}


/* *************************************************************************************************************************************************************************************************************************************************************** */
// In this section, we check if the user is on a mobile browser,
// and initialize the drag event listeners accordingly.

// If the user is on a phone, add a step button. Also, make the step
// button draggable so that the user can interact with any cells under it.
// https://stackoverflow.com/questions/11381673/detecting-a-mobile-browser.
let mobile_check = false;

window.mobileCheck = function(){
  // Test for mobile devices/browsers.
  (function(a){if(navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform) || /Tablet|iPad|(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) mobile_check = true;})(navigator.userAgent||navigator.vendor||window.opera);

  let na = document.getElementById('next_arrow')

  // If the user is on a mobile device/browser, initialize the mobile listeners.
  if(mobile_check){
    na.addEventListener('touchstart', addArrowMobileListener, false)
    addMobileGridListener() 
  }
  // Otherwise, initialize the desktop listeners.
  else{
    na.onmousedown = addArrowDesktopListener
    addDesktopgridListener()
  }
};

//window.mobileCheck()

/* *************************************************************************************************************************************************************************************************************************************************************** */


/* **************************************************
// Replaces the content of the next arrow generator.
// ************************************************** */
function overrideNextArrow( n // ID of arrow to be replaced with current next arrow.
){
  next_arrow = n
  let next_arrow_div = document.getElementById("next_arrow")
  next_arrow_div.dataset.status = n
  next_arrow_div.style.backgroundImage = arrow_path(n)
}


/* ****************************************************
// Replaces the content of the next next arrow preview.
// **************************************************** */
function overrideNextNextArrow( n // ID of arrow to be replaced with current next-next arrow.
){
  next_next_arrow = n
  let next_next_arrow_div = document.getElementById("next_next_arrow")
  next_next_arrow_div.dataset.status = n
  next_next_arrow_div.style.backgroundImage = arrow_path(n)
}


/* ****************************************************
// Replaces the content of the next arrow generator and
// the next next arrow preview.
// **************************************************** */
let overrideNextArrows = (n1,n2) => { overrideNextArrow(n1); overrideNextNextArrow(n2) }


/* **************************************************
// Changes the color of every arrow in the grid, the
// next arrows, and every arrow after that.
// ************************************************** */
function changeColor( color
){
  //arrow_colors = ["black", "white", "pink", "yellow", "orange", "green", "purple", "blue" ] 
  arrow_color = color // arrow_colors[color_index]

  overrideNextArrows(next_arrow, next_next_arrow)

  for(var i = 0; i < 25; ++i)
  {
    let cell_i = document.getElementById('cell'+i.toString()),
        status = cell_i.dataset.status

    cell_i.style.backgroundImage = arrows.includes(parseInt(status))? arrow_path(status) : arrow_path(0)
  }

}


/* **************************************************
// Handles cell-recoloring button click events.
// ************************************************** */
function arrowColorButtonClicked( name
){
  let button = document.getElementById(name);
  let color = name.split('-')[0]
  
  if(button.classList.contains('arrow-button-press'))
  {
    button.classList.remove('arrow-button-press')
    button.classList.add('arrow-button-unpress')
  }
  else
  {
    button.classList.remove('arrow-button-unpress')
    button.classList.add('arrow-button-press')
  }

  // Update the color after the button press is complete.
  button_sleep().then(() => {changeColor(color);})
}


/* *************************************************************************************************************************************************************************************************************************************************************** */

/* **************************************************
// Creates a new game instance when the page loads.
// ************************************************** */
$(document).ready( () => {
  
  // This style class allows us to circumvent unwanted initial css animations.
  sleep(500).then(() => {document.body.classList.remove('preload'); })

  // Check the user's device type.
  window.mobileCheck()

  initializeGame()

  //debug()
});


/* ****************************************************
// Loads the user's saved game from local storage, or
// (if the user has no saved game) creates a new game.
// **************************************************** */
function initializeGame(
){
  arrows_placed = 0;
  let did_save_content = window.localStorage.getItem('did_save_content')

  if(did_save_content !== null && did_save_content !== "false")
  {
    // Get the user's saved game state from local storage.
    let saved_next_arrow = window.localStorage.getItem('next_arrow'),
        saved_next_next_arrow = window.localStorage.getItem('next_next_arrow'),
        saved_spins = parseInt(window.localStorage.getItem('spins')),
        saved_score = parseInt(window.localStorage.getItem('score')),
        saved_color = window.localStorage.getItem('color');

    // Load the user's saved spin count.
    spins_remaining = isNaN(saved_spins)? "3" : saved_spins;
    document.getElementById('swap-label').innerHTML = spins_remaining.toString()

    // Load the user's saved score.
    score = isNaN(saved_score)? "0" : saved_score
    document.getElementById('score').innerHTML = score.toString()

    // Load the user's saved color choice.
    if(!["black", "white", "pink", "yellow", "orange", "green", "purple", "blue" ].includes(saved_color))
    { saved_color = "blue" }
    arrow_color = saved_color

    // Load the user's saved new arrows.
    next_arrow = arrows.includes(saved_next_arrow)? saved_next_arrow : null
    next_next_arrow = arrows.includes(saved_next_next_arrow)? saved_next_next_arrow : null
    overrideNextArrows(saved_next_arrow, saved_next_next_arrow)

    // Load the user's saved grid.
    for(var k = 0; k < 25; ++k)
    {
      let cell_id = 'cell'+k.toString(), 
          saved_status = window.localStorage.getItem(cell_id),
          [i,j] = grid_indices(k)

      saved_status = arrows.includes(parseInt(saved_status))? saved_status : "0"

      if(saved_status !== "0") { ++arrows_placed; if(arrows_placed === 25){endGameCheck()} }

      updateGridCell(i, j, saved_status)
    }
  }
  else
  {
    loadNewGame()
  }
}


/* **************************************************
// Saves thse current score, spins, grid, and new
// next arrows in local storage.
// ************************************************** */
function saveGame(
){
  // Saves each grid cell.
  for(var i = 0; i < 25; i++)
  {
    let status = document.getElementById('cell'+i.toString()).dataset.status;
    window.localStorage.setItem("cell" + i.toString(), status)
  }

  window.localStorage.setItem('next_next_arrow', next_next_arrow); 
  window.localStorage.setItem('next_arrow', next_arrow);
  window.localStorage.setItem('spins', spins_remaining);
  window.localStorage.setItem('score', score);
  window.localStorage.setItem('color', arrow_color);
  
  window.localStorage.setItem('did_save_content', 'true'); 
}


/* **************************************************
// Erases the save game state from local storage.
// ************************************************** */
function clearSavedGame(
){
  // Clears every cell.
  for(var i = 0; i < 25; i++)
  { window.localStorage.removeItem("cell" + i.toString()) }

  window.localStorage.removeItem('next_next_arrow'); 
  window.localStorage.removeItem('next_arrow');
  window.localStorage.removeItem('spins');
  window.localStorage.removeItem('score');
  // window.localStorage.removeItem('color'); // Probably better to leave this one out.
  window.localStorage.removeItem('did_save_content');
}


/* *****************************************************
// Resets all game fields. No relation to local storage.
// ***************************************************** */
function loadNewGame(
){
  updateNextArrows()

  spins_remaining = 3
  document.getElementById('swap-label').innerHTML = spins_remaining.toString()
  score = 0
  arrows_placed = 0
  document.getElementById('score').innerHTML = score.toString()
  //arrow_color = "blue"

  clearGrid()
}


// Makes ever grid cell empry.
function clearGrid(
){
  for(var i = 0; i < 5; ++i){
    for(var j = 0; j < 5; ++j)
    { updateGridCell(i,j,'0'); }
  }
}


/* *****************************************************
// Combines clearSavedGame and initializeGame to reset
// score and spins, clear the grid, and generate new
// next arrows. Prompts the user to confirm.
// ***************************************************** */
function resetGame( bypass_confirmation = false
){
  if(bypass_confirmation || window.confirm("Click ok to reset")) {
    // Erase saved game data.
    clearSavedGame()
    // Load a new game.
    //initializeGame()
    loadNewGame()
  }
}


/* **************************************************
// Saves the game when the user leaves.
// ************************************************** */
window.addEventListener('pagehide', event => {
  saveGame()
}, false);


/* ********************************************************
// The touch listeners have some weird behavior whenever
// the orientation changes. This listener solves the issue
// by reloading the page when the the orientation changes.
// It's not the best solution, but it will work for now.
// ******************************************************** */
window.addEventListener('orientationchange', event => {
  location.reload(true);
});


/* ******************************************************************************************************** */
// New Action classifier 
const Merge = Symbol("merge"),
      Combine = Symbol("combine"),
      Cancel = Symbol("cancel");

let basic_arr = [ 1, 5, 8, 3, 10, 4, 2, 7 ], //  "↑", "↓", "←", "→", "↖", "↘", "↗", "↙"
    mid_arr1 = [ 14, 9 ], // "⤡", "⤢"
    mid_arr2 = [ 6, 11 ], // "⬍", "⇿"
    mid_arr = [ 14, 9, 6, 11 ]
    max_arr = [ 17, 23, 40 ], // "+", "x", "*"
    arrows = [ 1, 5, 8, 3, 10, 4, 2, 7, 14, 9, 6, 11, 17, 23, 40 ]


// action_triples maps arrow ids to objects representing the potential actions that may be performed
// with the key-arrow. Each of the simplest (one-directional) arrows can be combined or cancelled
// with exactly one other (inverse) arrow (e.g. up ~ down), or merged with themself. Additionally, 
// these actions always require the same distance. Therefore, in this case, we can represent
// potential actions as the pair (inverse id, distance to combine); distance to cancel is simply
// negative distance to combine. Two directional arrows can only be combined and cancelled, and
// these actions depend on different distances. Furthermore, these arrows can be combined at
// several distances. So we associate to each two directional arrows an object containing
// valid combining distances, the cancel distance, and the inverse. The cases of arrows pointing
// in four or eight directions are simple and handled seperately.
let action_triples = { 1:[5,5], 5:[-5,1], 8:[1,3], 3:[-1,8], 2:[4,7], 7:[-4,2], 10:[6,4], 4:[-6,10]
                     , 11:[ [[1,5],1],6],  6:[[[1,5],5],11],  9:[[[4,6], 4],14], 14:[[[4,6], 6],9] }


/* **************************************************************
// Given two arrows (such as "↑" and "↓") and an action distance,
// classifyAction function returns either -1 (if the action is
// invalid), Combine, Merge, or Cancel (which tell to the action
// handle what to handle).
//
// Note that dist is necessarily signed. i.e., a distance
// of k is different than a distance of -k. Grid positions
// increase in decending and left to right order. For example,
//  a 3*3 grid has the following position values:
// [0] [1] [2]
// [3] [4] [5]
// [6] [7] [8]
//
// Positive k values imply a downward move, whereas negative
// values of k imply an upward move.
//
// consider the grid:
// [] [ ] []
// [] [↑] []
// [] [↓] []
//
// If the arrow in position 4, namely ↑ is dragged down into
// the arrow in position 7, namely ↓, then classifyAction
// should receive the arguments (↑,↓,3). Conversely, if the
// arrow in position 7 is dragged up into the arrow in position 4,
// then classifyAction should receive the arguments
// (↓,↑, -3). In either of these cases, Combine is returned.
//
// **************************************************************/
function classifyAction(arrow1, arrow2, dist){
  if(basic_arr.includes(arrow1)){
    let action_triple = action_triples[arrow1],
    valid_dist = action_triple[0], inv = action_triple[1];
    if(arrow1 === arrow2 && Math.abs(dist) === Math.abs(valid_dist)){ return Merge }
    if(arrow2 === inv && dist === valid_dist) { return Combine }
    if(arrow2 === inv && dist === -valid_dist) { return Cancel }
  }

  else if(mid_arr.includes(arrow1)) {
    let action_triple = action_triples[arrow1],
    valid_dist = action_triple[0], inv = action_triple[1];
    if(arrow1 === arrow2 && Math.abs(dist) === valid_dist[1]) { return Cancel }
    if(arrow2 === inv && valid_dist[0].includes(Math.abs(dist))) { return Combine }
  }

  else if([1,4,5,6].includes(Math.abs(dist))){
    if((arrow1 === arrow2 && arrow1 === 40)) { return Cancel; }
    else if((arrow1 === 17 && arrow2 === 23) || (arrow1 === 23 && arrow2 === 17)) { return Combine; }
  }
  return -1;
}


/* **************************************************
\\ resolveEdgeError verifies that actions are not
// exploiting certain properties of the grid.
\\
// Consider the grid:
\\
//    [ ] [ ] [↖]
\\    [ ] [ ] [ ]
//    [↘] [ ] [ ]
\\
// ↖ and ↘ are clearly in-actionable, however,
\\ because actions are determined by distance
// between arrows, it would be possible to combine
\\ them. i.e., ↖ and ↘ combine into ⤡ when separated
// by a distance of (GRID_SIZE+1).
\\
// The action classifier would treat the above
\\ action in exactly the same way as it would
// treat the same action on the following grid:
\\
//    [ ] [ ] [ ]
\\    [↖] [ ] [ ]
//    [ ] [↘] [ ]
\\
//
\\ Returns true if no error is detected.
//
// **************************************************/
function resolveEdgeError( src
                         , dest
                         , dist
){
  dist = Math.abs(dist)

  let src_r = src[0], dest_r = dest[0],
  grid_size = 5

  // No edge errors are possible for vertical
  // actions. e.g., all actions of ↑ and ↓.
  if(dist === grid_size) { return true; }

  // Resolves edge errors for horizontal actions.
  // If the arrows are separated by zero cells, then
  // perform the action iff the arrows are in the same
  // row.
  if(dist === 1) { return src_r === dest_r; }

  // Resolves edge errors for diagonal actions.
  // If the arrows are separated by 3 or 5 cells,
  // then require that the arrows are spaced apart by
  // one row.
  if(dist === grid_size-1 || dist === grid_size+1)
  { return Math.abs(src_r - dest_r) === 1; }

  return true;
}


/* ******************************************************************************************************** */
// End game check.

// This list contains all actionable cell distances.
const action_dists = [-6,-5,-4,-1,1,4,5,6]

/* **************************************************
// Returns the list of ids of cells whose which can
// arrows can combined/merger/canceled with an arrow
// in the cell corresponding to the given cell_id.
// ************************************************** */
function getNeighbors( cell_id
){ return action_dists.map( n => cell_id + n ) }


/* **************************************************
// Returns true iff there is an action on a pair of
// arrows whose distance from one another is dist.
// ************************************************** */
function canCombine( src, src_content, dest, dest_content, dist
){
  if( src >= 0 && dest >= 0 && src <= 24 && dest <= 24 // Cell ids are valid
   && resolveEdgeError(grid_indices(src), grid_indices(dest), dist) // Cells are not on oppsite sides of the grid.
   && classifyAction(src_content, dest_content, dist) !== -1) // An action exists on the src and dest arrows.
  { return true }

  return false;
}


/* ****************************************************
// Ideally, this would return true iff no more actions
// are possible counting whatever arrows are in the
// generator. But I don't really care to do that, so
// this returns true iff the grid is filled, and no
// two arrows can be combined/merged/cancelled.
// Honestly, there's no reason to go overboard with
// this. There's already a reset button. If the user
// knows that they've lost, they can use the reset
// button (and that's probably easier).
// **************************************************** */
function endGameCheck(
){
  for(var i = 0; i < 25; ++i)
  {
    let content_i = parseInt(document.getElementById("cell" + i).dataset.status),
        neighbors = getNeighbors(i)

    for (var j = 0; j < 8; ++j)
    {
      let n = neighbors[j]

      if(0 <= n && n < 25)
      {
        let content_n = parseInt(document.getElementById("cell" + n).dataset.status)
        if (canCombine(i, content_i, n, content_n,  i-n))
        { return false; }
      }
    }
  }
  
  // If false hasn't already been returned, then there are no moves remaining.
  endGameMenu()
  return true
}


/* **************************************************
// Hides the game, and shows the game over screen
// with score, high score, and reset buttons. Also
// Records and updates the high score in localStorage.
// 
// For testing: If there are any bugs in end game
// check, these lines are useful for viewing the grid
// after the end game menu has appeared.
// document.getElementById('ag_sub_container').style.opacity = 1; document.getElementById('ag_sub_container').style.display = "block"; document.getElementById('game-over-container').style.display = "none";
// document.getElementById('ag_sub_container').style.opacity = 0; document.getElementById('ag_sub_container').style.display = "none"; document.getElementById('game-over-container').style.display = "block";
//
// ************************************************** */
function endGameMenu(
){
  let game_sub_container = document.getElementById('ag_sub_container'),
      game_over_container = document.getElementById('game-over-container'),
      close_game = game_sub_container.animate(hide, 1500);

  /* Fade out the game. */
  close_game.finished.then( () => {
    game_sub_container.style.display = 'none';
    game_sub_container.style.opacity = '0';

    game_over_container.style.display = 'block'
    game_over_container.style.opacity = '0'

    let final_score = parseInt(document.getElementById('score').innerHTML),
        high_score = window.localStorage.getItem('high_score')

    // Display final score.
    document.getElementById('final_score').innerHTML = final_score

    // Update and display the high score.
    if(high_score === null || parseInt(high_score) < final_score)
    { window.localStorage.setItem('high_score', final_score) }
    high_score = window.localStorage.getItem('high_score')
    document.getElementById('high_score').innerHTML = high_score

    /* Fade in the end game menu. */
    let open_game_over_menu = game_over_container.animate(show, 500);
    open_game_over_menu.finished.then( () => {
      game_over_container.style.opacity = '1'

    })
  })
}


/* **************************************************
// hideEndGameMenu is called when the user clicks the
// "play again" button in the end game menu.
// ************************************************** */
function hideEndGameMenu(
){
  let game_sub_container = document.getElementById('ag_sub_container'),
      game_over_container = document.getElementById('game-over-container'),
      close_game_over = game_over_container.animate(hide, 1500);

  resetGame(true)
  /* Fade out the game. */
  close_game_over.finished.then( () => {
    game_over_container.style.display = 'none';
    game_over_container.style.opacity = '0';

    game_sub_container.style.display = 'block'
    game_sub_container.style.opacity = '0'

    /* Fade in the end game menu. */
    let reopen_game = game_sub_container.animate(show, 500);
    reopen_game.finished.then( () => {
      game_sub_container.style.opacity = '1'
    })
  })
}

/* ******************************************************************************************************** */
// These functions exists purely for debugging and experimentation.


// Places the arrow represented by N into every cell.
function fillWithNs( N
){
  for(var i = 0; i < 25; ++i)
  {
    let cell_i = document.getElementById('cell'+i.toString())
    cell_i.dataset.status = N.toString()
    cell_i.style.backgroundImage = arrow_path(N)
  }
}

// Fills the last two rows with whatever arrow N represents.
function fillBottomWithNs( N
){
  for(var i = 15; i < 25; ++i)
  {
    let cell_i = document.getElementById('cell'+i.toString())
    cell_i.dataset.status = N.toString()
    cell_i.style.backgroundImage = arrow_path(N)
  }
}


// Loads one of each arrow into the grid.
function loadEachArrow(
){
  for( var i = 0; i < arrows.length; ++i)
  {
    let N = arrows[i]
    let cell_i = document.getElementById('cell'+i.toString())
    cell_i.dataset.status = N.toString()
    cell_i.style.backgroundImage = arrow_path(N)
  }
}


/* **************************************************
// Initializes content for quick debugging when
// do_debug is true.
// ************************************************** */
function debug(
){
  if(!do_debug) { return }
  //overrideNextArrows(1,5) // Set first two arrows to up and down for testing gravity with distance > 1
  overrideNextArrows(3,8) // Loads -> and <-.
  loadEachArrow()
  spins_remaining = 950
}
