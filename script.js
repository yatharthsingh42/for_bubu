/* ==========================================================
   MOONLIGHT
   PART 1
   Dynamic Starfield
========================================================== */

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

    constructor() {

        this.reset();

        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height * 0.75;

    }

    reset() {

        this.radius = Math.random() * 1.8 + 0.2;

        this.alpha = Math.random();

        this.speed = 0.004 + Math.random() * 0.012;

        this.offset = Math.random() * Math.PI * 2;

    }

    update(time) {

        this.alpha =

            0.55 +

            Math.sin(

                time * this.speed + this.offset

            ) * 0.45;

    }

    draw() {

        ctx.beginPath();

        ctx.arc(

            this.x,
            this.y,
            this.radius,
            0,
            Math.PI * 2

        );

        ctx.fillStyle =

            `rgba(255,255,255,${this.alpha})`;

        ctx.shadowBlur = 10;

        ctx.shadowColor = "#A5D9FF";

        ctx.fill();

        ctx.closePath();

    }

}



/* ==========================================================
   CREATE STARS
========================================================== */

function createStars() {

    stars = [];

    for (let i = 0; i < STAR_COUNT; i++) {

        stars.push(

            new Star()

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

        ctx.shadowBlur = 25;

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

    drawMilkyWay();

    for (let star of stars) {

        star.update(time);

        star.draw();

    }

    drawBigStars(time);

    requestAnimationFrame(

        animate

    );

}



/* ==========================================================
   START
========================================================== */

resizeCanvas();

animate(0);
