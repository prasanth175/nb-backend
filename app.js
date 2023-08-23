const express = require("express");
const process = require('process');
const Razorpay = require('razorpay')
const nodemailer = require('nodemailer');
const cors = require('cors')
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require('./database')
const app = express();

require('dotenv').config()


app.use(express.json());
app.use(cors())
module.exports = app;

const PORT = process.env.PORT || 3006

app.listen(PORT, () => {
  console.log(`Server is running on ${PORT}...`)
})

const authProfile = (req, res, next) => {
  let jwtToken;
  const authToken = req.headers["authorization"];

  if (authToken !== undefined) {
    jwtToken = authToken.split(" ")[1];
  }
  if (jwtToken === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    // console.log(jwtToken)
    const isToken = jwt.verify(
      jwtToken,
      "PRASHANTH_KEY",
      async (error, payload) => {
        if (error) {
          res.status(401);
          res.send("Invalid JWT Token");
        } else {
          req.username = payload.username;
          next();
        }
      }
    );
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, email } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const [rows,fields] = await db.query('SELECT * FROM users WHERE email = ?', [email])
  if (rows.length === 0) {
    const [row, field] = await db.query('SELECT * FROM users WHERE username = ?', [username])
    if(row.length === 0){
      const createUserQuery = await db.query(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword])
    const payload = {
      username: username,
    };
    const jwtToken = jwt.sign(payload, "PRASHANTH_KEY");
    response.send({ status_code: 200,
      error_txt: 'Account Created Successfully', jwtToken });
    }else{
      response.send({
        status_code: 400,
        error_txt: 'Username already exists'
      });
    }
  } else {
    response.send({
      status_code: 400,
      error_txt: 'Email already exists'
    });
  }
});

app.post('/generate-otp', async (req, res) => {
  const { email } = req.body;
  
  try {
    await db.query(`DELETE FROM otpDetails WHERE email='${email}'`);

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    console.log(otp);

    // Insert new OTP details into the database
    await db.query(`INSERT INTO otpDetails (email, otp) VALUES (?, ?)`, [email, otp]);

    // Send OTP to user's email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: '1022prasanthkumar@gmail.com',
        pass: 'uokhckuokumfsmqw'
      }
    });

    const mailOptions = {
      from: '1022prasanthkumar@gmail.com',
      to: email,
      subject: 'OTP for registration',
      text: `Your OTP for registration is ${otp}. Please enter this OTP on the registration page to verify your email address.`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error(error);
        return res.status(500).json({ message: 'Failed to send OTP' });
      }
      console.log('OTP sent: ' + info.response);
      res.json({ message: 'OTP generated and sent to your email address.' });
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});


app.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    // Retrieve OTP details from the database for the provided email
    const [rows, fields] = await db.query(`SELECT * FROM otpDetails WHERE email = ?`, [email]);

    if (rows.length === 0) {
      res.json({ message: 'Email Not Found', status: 401 });
    } else {
      const dbRes = rows[0]; // Get the first row

      // Verify the OTP
      const verifyOtp = dbRes.otp === otp;

      if (!verifyOtp) {
        res.json({ message: 'Invalid OTP', status: 402 });
      } else {
        res.json({ message: 'Email Verified', status: 200 });
      }
    }
  } catch (error) {
    console.error(error);
    res.json({ message: 'Internal Server Problem', status: 400 });
  }
});



app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const [rows, fields] = await db.query("SELECT * FROM users WHERE username = ?", [username]);

  if (rows.length === 0) {
    res.send({
      status_code: 400,
      error_msg: 'Invalid User'
    });
  } else {
    const user = rows[0]; // Get the first user (if there are multiple)
    const isCorrect = await bcrypt.compare(password, user.password);

    if (isCorrect === true) {
      const payload = {
        username: user.username,
      };
      const jwtToken = jwt.sign(payload, "PRASHANTH_KEY");
      res.send({ jwtToken, status_code: 200 });
    } else {
      res.send({
        status_code: 400,
        error_msg: 'Wrong Password',
        username
      });
    }
  }
});


app.get('/books', authProfile, async (req, res) => {
  try {
    const name = req.username
    const {search_by = '', category} = req.query
  let getAllBooks;
  if(category === ''){
    [rows, fields] = await db.query(`
  SELECT * FROM sellBook 
  WHERE description LIKE '%${search_by}%' and userId NOT LIKE '${name}'
  `)
  }else{
    [rows, fields] = await db.query(`
  SELECT * FROM sellBook 
  WHERE description LIKE '%${search_by}%' AND category LIKE '${category}' and userId NOT LIKE '${name}'
  `)
  }
  console.log(rows)

  res.send({rows})
  } catch (error) {
    res.status(500)
  }
})

app.get('/books/:id', async (req, res) => {
  const bookId = req.params.id
  const row = await db.query( `
  select * from sellBook where bookId = '${bookId}'
  `)
  const dbRes = row[0][0]
  res.send({dbRes})
})

app.post('/biddetails', authProfile, async (req, res) => {
  const name = req.username

  const {bookId, bidAmount, mobile, title, description, file} = req.body

  const [row, field] = await db.query(`select * from bidDetails where user='${name}' and bookId = '${bookId}'`)
  if(row.length !== 0){
    const updateData = await db.query(`
    UPDATE bidDetails
    SET bidAmount = '${bidAmount}',
    mobile = '${mobile}'
    WHERE bookId = '${bookId}' and user = '${name}'
    `)
  }else{
    const [rows, fields] = await db.query( `
  INSERT INTO bidDetails (user, bookId, bidAmount, mobile, title, description, file) 
  VALUES (
    '${name}',
    '${bookId}',
    '${bidAmount}',
    '${mobile}',
    '${title}',
    '${description}',
    '${file}'
  )
  `)
  }
  res.send({status_code: 200})
})

app.post('/book-bid-details', authProfile, async (req, res) => {
  const name = req.username
  const { bookId} = req.body 
  const row = await db.query(`select * from  bidDetails where user = '${name}' and bookId = '${bookId}'`)
  const response = row[0][0]
  res.send({response})
})

app.get('/products/:id', async (req, res) => {
  const bookId = req.params.id
  const [rows, fields] = await db.query(`select * from sellBook where bookId = '${bookId}'`)
  const dbRes = rows[0]
  res.send({dbRes})
})

app.delete('/products/:id', async (req, res) => {
  const {id} = req.params
  const delItem = await db.query(`
  DELETE FROM sellBook WHERE bookId = '${id}'
  `)

  res.send({delItem})
})

app.get('/details', authProfile, async (req, res) => {
  const name = req.username
  res.send({name})
})

app.post('/mail-details', async (req,res) => {
  const {username} = req.body 
  const rows = await db.query(`SELECT * FROM users WHERE username = '${username}'`)
  const dbRes = rows[0]
  res.send({dbRes})
})

app.get('/products', authProfile, async (req, res) => {
  try {
    const name = req.username
  const [rows, fields] = await db.query(`
  select * from sellBook where userId='${name}'
  `)
  res.send({rows})
  } catch (error) {
    res.status(500)
  }
})



app.post('/sell/', authProfile, async (request, response) => {
  try {
    const name = request.username
    const {sellDetails} = request.body
    const otherData = JSON.parse(request.body.sellDetails)
  const {category, title,
    author,
    description,
    publication_year,
    isbn,
    printed_price,
    selling_price, language, bookId, image} = otherData;
    const [rows, fields] = await db.query(`SELECT * FROM sellBook WHERE isbn = '${isbn}' and userId = '${name}'`)

    if(rows.length === 0){
      await db.query(`
    INSERT INTO sellBook (bookId, category, title, author, description,
      publication_year, isbn, printed_price, selling_price, language, userId, file) 
    VALUES (
      '${bookId}',
      '${category}',
      '${title}',
      '${author}',
      '${description}',
      '${publication_year}',
      '${isbn}',
      '${printed_price}',
      '${selling_price}',
      '${language}',
      '${name}',
      '${image}'
    );
    `)
    response.send({
      status: 200,
      bookId,
      message: 'Book Added Successfully'
    })
    }else{
      response.send({message: 'This Book is already published by you', status: 400})
    }
  } catch (error) {
    response.send({error})
  }


})

app.post('/update-sell', async (request, response) => {
  try {
    const name = request.username
  const {category, title,
    author,
    description,
    publication_year,
    isbn,
    printed_price,
    selling_price, language, file, bookId} = request.body;
      const updateData = await db.query(`
    UPDATE sellBook
    SET category = '${category}',
    title = '${title}',
    author= '${author}',
    description = '${description}',
    publication_year = '${publication_year}',
    isbn = '${isbn}',
    printed_price = '${printed_price}',
    selling_price = '${selling_price}',
    language = '${language}',
    file = '${file}'
    WHERE bookId = '${bookId}'
    `)
    response.send({
      status: 200,
      bookId,
      message: 'Book Updated Successfully'
    })
  } catch (error) {
    res.send({error})
  }
})

app.post('/biddata', async (req, res) => {
  const {bookId} = req.body 
   const [rows, fields] = await db.query(`
   SELECT * FROM bidDetails where bookId = '${bookId}'
   `)

   res.send({rows})
})

app.get('/cart-details', authProfile, async (req, res) => {
  try {
    const name = req.username
  const [rows, fields] = await db.query(`select * from bidDetails where user = '${name}'`)
  res.send({rows})
  } catch (error) {
    res.status(500)
  }
})

app.delete('/cart-details/:id', async (req, res) => {
  const {id} = req.params
  const delCartItem = await db.query(`DELETE FROM bidDetails WHERE bookId = '${id}'`)
  res.send({status_code: 200})

})

// Integrate Razor pay Into our project

const razorpay = new Razorpay({
  key_id: "rzp_test_YpJuwcUUcAfw87",
  key_secret: "Z84M1Ws2Z5MrAbOEHeAmXlAv",
});

app.post('/create-order', async (req, res) => {
  const { amount, currency } = req.body;

  const options = {
    amount: amount,
    currency: currency,
  };

  try {
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    res.status(500).send("Error creating order");
  }
});

app.get('/payments/:id', async (req, res) => {
  const {id} = req.params
  const [rows, fields] = await db.query(`SELECT * FROM sellBook WHERE bookId = '${id}'`)
  res.send({rows})
})

app.post('/set-password', async (req,res)=> {
  try {
    const {password, email} = req.body 
  const hashedPassword = await bcrypt.hash(password, 10);
  const [rows, fields] = await db.query(`SELECT * FROM user WHERE email = '${email}'`)

  const dbResponse = await db.get(getEmail)
  if(rows.length === 0){
    res.send({message: 'No user is registered with this Email', status: 400})
  }else{
    await db.query(`
    UPDATE user 
    SET password = '${hashedPassword}'
    WHERE email = '${email}'
    `)
    res.send({message: 'Password Successfully Updated', status: 200})
  }
  } catch (error) {
    res.send({message: error, status: 500})
  }
})

app.post('/change-password',authProfile, async (req,res)=> {
  try {
   const passDetails = req.body
   const {currentPassword, confirmPassword} = passDetails
   const name = req.username
   const [rows, fields] = await db.query(`SELECT password FROM user WHERE username = '${name}'`)
   const isCorrect = await bcrypt.compare(rows[0].password, currentPassword)
   if(isCorrect){
    const hashedPassword = await bcrypt.hash(confirmPassword, 10)
    await db.query(`
    UPDATE user 
    SET password = '${hashedPassword}'
    WHERE username = '${name}'
    `)

    res.send({
      error_msg: 'Password Updated Successfully',
      error_code: 200
    })
   }else{
    res.send({
      error_msg: 'Incorrect Password',
      error_code: 400
    })
   }
  }catch (error) {
    res.send({message: error, status: 500})
  }
})


app.get('/userDetails', async (req, res) => {
  const [rows, fields] = await db.query('DESCRIBE users')
  res.send({rows})
})

app.get('/users', async (req, res) => {
  const [rows, fields] = await db.query('SELECT * FROM users')
  res.send({rows})
})