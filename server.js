const express = require('express');
const formidable = require('formidable'); // Added Formidable
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors'); // Import cors package
const axios = require('axios'); // Import axios for API requests
const app = express();
const port = 3000;
const multer = require('multer');
const storage = multer.memoryStorage(); // Store files in memory
const upload = multer({ storage });
const fs = require('fs');

const path = require('path');

const { Telegraf } = require('telegraf');

const db = new sqlite3.Database('db.db');
const TELEGRAM_BOT_TOKEN = '7487928760:AAFNzDJaONyEZT9aAVp2uTK-JB-a1VAbSBw'; // Replace with your actual token

// Create a new instance of the TelegramBot class
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Middleware to handle CORS
app.use(cors()); // Enable CORS for all routes

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files (optional)
app.use(express.static('./'));

// Ensure the transactions table exists
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_name TEXT,
            product_price REAL,
            product_id TEXT,
            status TEXT,
            user TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            longitude REAL,
            latitude REAL,
            weight REAL,
            price REAL,
            name TEXT,
            type TEXT,
            identifier TEXT,
            product_image BLOB,
            location_image BLOB,
            location TEXT
        )
    `);
});

// Function to create a new wallet address
async function createWalletAddress(user_id) {
    console.log(user_id)
    try {
        const response = await axios.post('https://coinremitter.com/api/v3/LTC/get-new-address', {
            api_key: '$2b$10$HLFBE62u7cX1iVMA9jEYJumZ5Mwi6Xme/GcNEY8TeFmkqIzidw7Fe',  // Replace with your actual API key
            password: 'lavkanal123',
            label:user_id// Replace with your actual wallet password
        });

        if (response.data.flag === 1) {
            // Extract the new address from the response
            const newAddress = response.data.data.address;

            // Log or store the new address along with the user_id and label
            console.log(`New address created for user ${user_id} with label: ${newAddress}`);

            // Example: Save to database or handle user_id and label
            // saveAddressToDatabase(user_id, label, newAddress);  // Implement this function as needed

            // Return the new address
            return newAddress;
        } else {
            throw new Error('Failed to create wallet address');
        }
    } catch (error) {
        console.error('Error creating wallet address:', error.message);
        throw error;
    }
}
// Route to check if a user exists and create a wallet if not
app.post('/api/check-user', async (req, res) => {
    const { user_id } = req.body;
    
    if (!user_id) {
        return res.status(400).send('User ID is required.');
    }

    try {
        // Check if the user exists in the database
        db.get('SELECT * FROM users WHERE user_id = ?', [user_id], async (err, row) => {
            if (err) {
                console.error('Error retrieving user:', err.message);
                return res.status(500).send('Error retrieving user.');
            }

            if (row) {
                // User exists, return the wallet address
                res.json({ exists: true, walletAddress: row.wallet_address });
            } else {
                // User does not exist, create a new wallet address
                try {
                    const walletAddress = await createWalletAddress(user_id);

                    // Insert the new user with the wallet address into the database
                    db.run('INSERT INTO users (user_id, wallet_address) VALUES (?, ?)', [user_id, walletAddress], function(err) {
                        if (err) {
                            console.error('Error inserting new user:', err.message);
                            return res.status(500).send('Error creating user.');
                        }

                        // Return the new wallet address
                        res.json({ exists: false, walletAddress });
                    });
                } catch (error) {
                    console.error('Error creating wallet address:', error.message);
                    res.status(500).send('Error creating wallet address.');
                }
            }
        });
    } catch (error) {
        console.error('Error handling request:', error.message);
        res.status(500).send('Internal server error.');
    }
});

// Route to handle new transactions
app.post('/api/transactions', (req, res) => {
    const { productName, productPrice, productId, user,crypto ,lat,lng} = req.body;
    console.log(productName, productPrice, productId, user,crypto,lat,lng);

    // Validate the input fields
    if (!productName || !productPrice || !productId || !user || !crypto || !lat || !lng) {
        console.error('Missing required fields.');
        return res.status(400).send('Product name, price, and ID are required.');
    }

    db.serialize(() => {
        // Prepare the SQL statement to insert a new transaction
        const stmt = db.prepare(`
            INSERT INTO transactions (product_name, product_price, product_id, status, user,amount_in_dash,lat,lng)
            VALUES (?, ?, ?, ?, ?,?,?,?)
        `);

        // Execute the SQL statement with the provided data
        stmt.run(productName, productPrice, productId, 'ON', user,crypto,lat,lng, function(err) {
            if (err) {
                console.error('Error saving transaction:', err.message);
                console.error(err.stack); // Log stack trace for debugging
                return res.status(500).send('Error saving transaction.');
            }
            res.send('Transaction successfully recorded.');
        });

        stmt.finalize();
    });
});

// Route to handle form submissions
// Handle form submission
app.post('/submit-product', upload.fields([{ name: 'image' }, { name: 'locationimage' }]), (req, res) => {
    const { latitude, longitude, weight, price, name, type, location, identifier } = req.body;
    const product_image = req.files['image'][0]?.buffer;
    const location_image = req.files['locationimage'][0]?.buffer;

    if (!product_image || !location_image) {
        return res.status(400).send('Both images are required.');
    }

    // Insert product data into database
    db.run(`INSERT INTO products (latitude, longitude, weight, price, name, type, location, identifier, product_image, location_image)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
            [latitude, longitude, weight, price, name, type, location, identifier, product_image, location_image],
            function(err) {
                if (err) {
                    console.error('Error inserting data:', err.message);
                    return res.status(500).send('Error saving product.');
                }
                res.send('Product successfully uploaded.');
            });
});

// Route to retrieve all transactions for a user
app.get('/api/orders/:userId', (req, res) => {
    const userId = req.params.userId;

    // Validate user ID
    if (!userId) {
        return res.status(400).send('User ID is required.');
    }

    // Query the database for transactions associated with the provided userId
    db.all(
        `SELECT * FROM transactions WHERE user = ?`,
        [userId],
        (err, rows) => {
            if (err) {
                console.error('Error retrieving transactions:', err.message);
                return res.status(500).send('Error retrieving transactions.');
            }

            if (rows.length > 0) {
                // Respond with the transaction data
                res.json(rows);
            } else {
                // No transactions found for the user
                res.status(404).send('No transactions found for this user.');
            }
        }
    );
});

app.post('/api/deleteTransaction', (req, res) => {
    const { productId } = req.body;

    // Validate productId
    if (!productId) {
        return res.status(400).send('Product ID is required.');
    }

    // Delete the transaction from the database
    db.run('DELETE FROM transactions WHERE product_id = ?', [productId], function(err) {
        if (err) {
            console.error('Error deleting transaction:', err.message);
            return res.status(500).send('Error deleting transaction.');
        }

        if (this.changes > 0) {
            res.send('Transaction deleted successfully.');
        } else {
            res.status(404).send('Transaction not found.');
        }
    });
});


// Route to delete a product
app.delete('/product/:identifier', (req, res) => {
    const identifier = req.params.identifier;

    db.run('DELETE FROM products WHERE identifier = ?', [identifier], function(err) {
        if (err) {
            console.error('Error deleting product:', err.message);
            return res.status(500).send('Error deleting product.');
        }
        if (this.changes > 0) {
            res.send('Product successfully deleted.');
        } else {
            res.status(404).send('Product not found.');
        }
    });
});

// Route to retrieve product details
app.get('/product/:identifier', (req, res) => {
    const identifier = req.params.identifier;

    db.get('SELECT * FROM products WHERE identifier = ?', [identifier], (err, row) => {
        if (err) {
            console.error('Error retrieving product:', err.message);
            return res.status(500).send('Error retrieving product.');
        }
        if (row) {
            // Construct the response object
            const productDetails = {
                identifier: row.identifier,
                name: row.name,
                price: row.price,
                weight: row.weight,
                type: row.type,
                longitude: row.longitude,
                latitude: row.latitude,
                // Serve image URLs if needed
            };
            res.json(productDetails);
        } else {
            res.status(404).send('Product not found');
        }
    });
});

// Route to retrieve all products
app.get('/api/products', (req, res) => {
    db.all('SELECT * FROM products', [], (err, rows) => {
        if (err) {
            throw err;
        }

        // Convert BLOB image data to Base64
        rows = rows.map(row => {
            if (row.product_image) {
                row.product_image = `data:image/png;base64,${Buffer.from(row.product_image).toString('base64')}`;
            } else {
                row.product_image = ''; // or null
                console.log('Image data is missing for row:', row);
            }
            return row;
        });

        res.json({ products: rows });
    });
});

// Route to serve product images
app.get('/images/:type/:identifier', (req, res) => {
    const { type, identifier } = req.params;
    const columnName = type === 'product' ? 'product_image' : 'location_image';

    db.get('SELECT ' + columnName + ' FROM products WHERE identifier = ?', [identifier], (err, row) => {
        if (err) {
            console.error('Error retrieving image:', err.message);
            return res.status(500).send('Error retrieving image.');
        }
        if (row && row[columnName]) {
            res.set('Content-Type', 'image/jpeg');
            res.send(row[columnName]);
        } else {
            res.status(404).send('Image not found.');
        }
    });
});


app.post('/webhook', (req, res) => {
    const form = new formidable.IncomingForm();
    console.log(form)
    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Error parsing form:', err);
            res.status(400).send('Error parsing form');
            return;
        }

        const address_label = Array.isArray(fields.address_label) ? fields.address_label[0] : fields.address_label;
        const amount = fields.amount;

        console.log('Received address_label:', address_label);
        console.log('Received amount:', amount);

        res.status(200).send('Webhook received');

        const trimmedAddressLabel = address_label;
        const amountInFloat = parseFloat(amount);

        // Query the database
        db.all('SELECT amount_in_dash, product_id FROM transactions WHERE user = ?', [trimmedAddressLabel], async (err, rows) => {
            if (err) {
                console.error('Error retrieving transactions:', err.message);
                return;
            }

            console.log('Database query result:', rows);

            if (rows.length > 0) {
                const amountInDash = rows[0].amount_in_dash;
                const productId = rows[0].product_id;

                console.log('Amount in dash from database:', amountInDash);

                if (amountInFloat >= amountInDash) {
                    console.log('Transaction valid.');

                    // Delete the transaction from the database
                    db.run('DELETE FROM transactions WHERE product_id = ?', [productId], (err) => {
                        if (err) {
                            console.error('Error deleting transaction:', err.message);
                            return;
                        }
                        console.log('Transaction deleted successfully.');
                    });

                    // Fetch product information
                    db.get('SELECT location_image, latitude, longitude FROM products WHERE identifier = ?', [productId], (err, row) => {
                        if (err) {
                            console.error('Error retrieving product image:', err.message);
                            return;
                        }

                        if (row) {
                            const latitude = (row.latitude || '').trim();
                            const longitude = (row.longitude || '').trim();

                            if (row.location_image) {
                                // Save the image as a JPG file
                                const filePath = path.join(__dirname, 'location_image.jpg');
                                fs.writeFile(filePath, row.location_image, 'base64', (err) => {
                                    if (err) {
                                        console.error('Error saving image:', err.message);
                                        return;
                                    }
                                    console.log('Image saved successfully.');

                                    // Send the image to the user via Telegram
                                    bot.telegram.sendPhoto(trimmedAddressLabel, { source: filePath })
                                        .then(() => {
                                            console.log('Image sent successfully.');
                                            // Delete the image file after sending
                                            fs.unlink(filePath, (err) => {
                                                if (err) {
                                                    console.error('Error deleting image:', err.message);
                                                } else {
                                                    console.log('Image deleted successfully.');
                                                }
                                            });
                                        })
                                        .catch(error => {
                                            console.error('Error sending image to Telegram:', error.message);
                                        });

                                    // Send confirmation message to user
bot.telegram.sendMessage(trimmedAddressLabel, `Ձեր գործարքը վավեր է և հաջողությամբ մշակվել է:\nԿոորդինատներ : ${longitude}, ${latitude} \n https://yandex.com/maps/?ll=${longitude}%2C${latitude}`, { parse_mode: 'HTML' });
                                });
                            } else {
                                console.log('No location image found for the product.');
                                // Send a message without image if needed
                                bot.telegram.sendMessage(trimmedAddressLabel, 'Ձեր գործարքը վավեր է և հաջողությամբ մշակվել է:');

                                // Send confirmation message to user
bot.telegram.sendMessage(trimmedAddressLabel, `Ձեր գործարքը վավեր է և հաջողությամբ մշակվել է:\nԿոորդինատներ : ${longitude}, ${latitude} \n https://yandex.com/maps/?ll=${longitude}%2C${latitude}`, { parse_mode: 'HTML' });
                            }
                        } else {
                            console.log('No product found for the given product ID.');
                            // Handle case when no product is found
                        }
                    });
                } else {
                    console.log('Transaction amount is less than required. Amount:', amountInFloat, 'Required:', amountInDash);
                    bot.telegram.sendMessage(trimmedAddressLabel, 'Գործարքի գումարը պահանջվածից պակաս է: ');
                }
            } else {
                console.log('No transactions found for the user.');
                // Handle case when no transactions are found
            }
        });
    });
});



app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
