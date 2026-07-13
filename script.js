/* ==========================================================
   MOONLIGHT
   PART 1
   Dynamic Starfield
========================================================== */
let skyRotation = 0;
const canvas = document.getElementById("stars");
const ctx = canvas.getContext("2d");

let stars = [];
const STAR_COUNT = 450;

function resizeCanvas() {

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    createStars();
}

window.addEventListener("resize", resizeCanvas);



/* ==========================================================
   STAR CLASS
========================================================== */

class Star {

    constructor(x, y, radius, type = "small") {

        this.x = x;
        this.y = y;

        this.radius = radius;
        this.type = type;

        this.phase = Math.random() * Math.PI * 2;

        this.speed = 0.3 + Math.random() * 1.5;

        this.alpha = 0.4 + Math.random() * 0.6;

        this.rotation = Math.random() * Math.PI;

        const colours = [

            "#FFFFFF",
            "#F7F8FF",
            "#E6EEFF",
            "#FFF5DE"

        ];

        this.colour =
            colours[
                Math.floor(
                    Math.random() * colours.length
                )
            ];

    }



    update(time) {

        const pulse =

            Math.sin(

                time * 0.001 * this.speed +

                this.phase

            );

        this.alpha =

            0.45 +

            pulse * 0.25;

    }



    draw() {

        ctx.save();

        ctx.translate(this.x, this.y);

        ctx.rotate(this.rotation);

        ctx.strokeStyle = this.colour;

        ctx.globalAlpha = this.alpha;

        if(this.type==="hero"){

            ctx.shadowBlur=18;

        }

        else if(this.type==="medium"){

            ctx.shadowBlur=8;

        }

        else{

            ctx.shadowBlur=3;

        }

        ctx.shadowColor=this.colour;



        ctx.beginPath();

        ctx.moveTo(0,-this.radius);

        ctx.lineTo(this.radius,0);

        ctx.lineTo(0,this.radius);

        ctx.lineTo(-this.radius,0);

        ctx.closePath();
        ctx.fillStyle = this.colour;
        ctx.fill();

        ctx.stroke();



        if(this.type==="hero"){

            ctx.beginPath();

            ctx.moveTo(-this.radius*2,0);

            ctx.lineTo(this.radius*2,0);

            ctx.moveTo(0,-this.radius*2);

            ctx.lineTo(0,this.radius*2);

            ctx.stroke();

        }

        ctx.restore();

    }

}



/* ==========================================================
   CREATE STARS
========================================================== */

function createStars(){

    stars=[];

    const clusters=[];

    for(let i=0;i<8;i++){

        clusters.push({

            x:Math.random()*canvas.width,

            y:Math.random()*canvas.height*.65

        });

    }



    for(let i=0;i<STAR_COUNT;i++){

        let x;
        let y;

        if(Math.random()<0.65){

            const c=

            clusters[

                Math.floor(

                    Math.random()*clusters.length

                )

            ];

           x = Math.max(
    0,
    Math.min(
        canvas.width,
        c.x + (Math.random()-0.5)*250
    )
);

y = Math.max(
    0,
    Math.min(
        canvas.height*0.75,
        c.y + (Math.random()-0.5)*180
    )
);

        }

        else{

            x=Math.random()*canvas.width;

            y=Math.random()*canvas.height*.75;

        }



        let radius=.5+Math.random();

        let type="small";



        if(Math.random()<.12){

            radius=1.4;

            type="medium";

        }



        if(Math.random()<.02){

            radius=2.4;

            type="hero";

        }



        stars.push(

            new Star(

                x,

                y,

                radius,

                type

            )

        );

    }

}



/* ==========================================================
   BIG STARS
========================================================== */

function drawBigStars(time) {

    for (let i = 0; i < 25; i++) {

        const x =
            (canvas.width / 25) * i +
            Math.sin(i * 12.2) * 80;

        const y =
        40 +
        Math.random()*250;

        const pulse =

            0.5 +

            Math.sin(

                time * 0.002 + i

            ) * 0.5;

        ctx.beginPath();

        ctx.arc(

            x,
            y,
            2 + pulse,
            0,
            Math.PI * 2

        );

        ctx.fillStyle =

            `rgba(220,235,255,${0.5 + pulse * 0.5})`;

        ctx.shadowBlur = this.radius * 8;

        ctx.shadowColor = "#A8D8FF";

        ctx.fill();

    }

}



/* ==========================================================
   MILKY WAY GLOW
========================================================== */

function drawMilkyWay() {

    const grad =

        ctx.createLinearGradient(

            0,
            0,

            canvas.width,

            canvas.height

        );

    grad.addColorStop(

        0,

        "rgba(100,160,255,0)"

    );

    grad.addColorStop(

        .5,

        "rgba(140,190,255,.06)"

    );

    grad.addColorStop(

        1,

        "rgba(100,160,255,0)"

    );

    ctx.fillStyle = grad;

    ctx.fillRect(

        0,
        0,
        canvas.width,
        canvas.height

    );

}



/* ==========================================================
   ANIMATION LOOP
========================================================== */

function animate(time) {

    ctx.clearRect(

        0,
        0,
        canvas.width,
        canvas.height

    );

   skyRotation += 0.00001;

ctx.save();

ctx.translate(

    canvas.width/2,

    canvas.height/2

);

ctx.rotate(skyRotation);

ctx.translate(

    -canvas.width/2,

    -canvas.height/2

);
   

    drawMilkyWay();

    for (let star of stars) {

        star.update(time);

        star.draw();

    }

    drawBigStars(time);
   ctx.restore();

    requestAnimationFrame(

        animate

    );

}



/* ==========================================================
   START
========================================================== */

resizeCanvas();

animate(0);
