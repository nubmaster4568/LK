
const express = require('express');
const formidable = require('formidable');
const { Pool } = require('pg'); // Import pg for PostgreSQL
const cors = require('cors');
const axios = require('axios');
const app = express();
const port = 3000;
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage });
const fs = require('fs');
const path = require('path');
const { Telegraf } = require('telegraf');
const sharp = require('sharp');

const TELEGRAM_BOT_TOKEN = '7487928760:AAFNzDJaONyEZT9aAVp2uTK-JB-a1VAbSBw'; // Replace with your actual token

// Create a new instance of the TelegramBot class
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
// PostgreSQL connection

const client = new Pool({
    connectionString: 'postgresql://lavkanal_database_user:Uvv7AiAQxOVcNhu6k8m6NbieNluiY7HL@dpg-cqhruo1u0jms739c7aq0-a.oregon-postgres.render.com/lavkanal_database',
    ssl: { rejectUnauthorized: false }
});
client.connect();

// Middleware to handle CORS
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('./'));

// Ensure the tables exist
client.query(`
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    product_name TEXT,
    product_price REAL,
    product_id TEXT,
    status TEXT,
    user_id TEXT,  -- Changed from 'user'
    amount_in_dash REAL,
    lat REAL,
    lng REAL
);

`, (err) => {
    if (err) {
        console.error('Error creating transactions table:', err.message);
    }
});
// Ensure the admin_users table exists
client.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
        user_id TEXT PRIMARY KEY
    )
`, (err) => {
    if (err) {
        console.error('Error creating admin_users table:', err.message);
    }
});

client.query(`
    CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        longitude REAL,
        latitude REAL,
        weight REAL,
        price REAL,
        name TEXT,
        type TEXT,
        identifier TEXT UNIQUE,
        product_image BYTEA,
        location_image BYTEA,
        location TEXT
    )
`, (err) => {
    if (err) {
        console.error('Error creating products table:', err.message);
    }
});



client.query(`CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    location_name TEXT UNIQUE
)
`, (err) => {
    if (err) {
        console.error('Error creating tables:', err.message);
    }
});
app.get('/', (req, res) => {
    // Get the IP address of the client
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    res.send(`Your IP address is: ${ip}`);
});
app.get('/api/locations', async (req, res) => {
    try {
        // Log the start of the request
        console.log('Received request for /api/locations');

        // Fetch unique location names from the database
        const result = await client.query('SELECT DISTINCT location_name FROM locations');
        
        // Log the fetched locations
        console.log('Fetched locations:', result.rows);

        // Respond with the locations
        res.json({ locations: result.rows.map(row => row.location_name) });
    } catch (error) {
        // Log detailed error information
        console.error('Error fetching locations:', error.message);
        console.error('Stack trace:', error.stack);

        // Respond with a 500 status and error message
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
});
app.post('/removeLocation', async (req, res) => {
    try {
        // Extract the location name from the request body
        const { location_name } = req.body;

        // Ensure the location name is provided
        if (!location_name) {
            return res.status(400).json({ error: 'Location name is required' });
        }

        // Query to delete the location by name (assuming a unique constraint or handling is in place)
        const result = await client.query('DELETE FROM locations WHERE location_name = $1 RETURNING *', [location_name]);

        // Check if a location was deleted
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }

        // Respond with a success message
        res.status(200).json({ message: 'Location removed successfully' });
    } catch (error) {
        // Handle any errors
        console.error('Error removing location:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/addlocation', async (req, res) => {
    const { location_name } = req.body;

    if (!location_name) {
        return res.status(400).send('Location name is required.');
    }

    try {
        await client.query('INSERT INTO locations (location_name) VALUES ($1) ON CONFLICT (location_name) DO NOTHING', [location_name]);
        res.send('Location added successfully.');
    } catch (err) {
        console.error('Error adding location:', err.message);
        res.status(500).send('Error adding location.');
    }
});

// Function to create a new wallet address
async function createWalletAddress(user_id) {
    try {
        const response = await axios.post('https://coinremitter.com/api/v3/LTC/get-new-address', {
            api_key: '$2b$10$EtqqSwKR3Ws3iLsXqz5w/exSodg1N60PD8X9UQAvxH9/jtFDR635G',
            password: 'lavkanal123',
            label: user_id
        });

        if (response.data.flag === 1) {
            const newAddress = response.data.data.address;
            return newAddress;
        } else {
            throw new Error('Failed to create wallet address');
        }
    } catch (error) {
        console.error('Error creating wallet address:', error.message);
        throw error;
    }
}




// Route to add or remove admin users
app.post('/admins', async (req, res) => {
    const { action, user_id } = req.body;
    console.log(action, user_id);
    if (!action || !user_id) {
        return res.status(400).send('Action and user ID are required.');
    }

    try {
        if (action === 'add') {
            // Add admin user
            await client.query('INSERT INTO admin_users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [user_id]);
            res.send('Admin user added successfully.');
        } else if (action === 'remove') {
            // Remove admin user
            const result = await client.query('DELETE FROM admin_users WHERE user_id = $1 RETURNING *', [user_id]);

            if (result.rowCount > 0) {
                res.send('Admin user removed successfully.');
            } else {
                res.status(404).send('Admin user not found.');
            }
        } else {
            res.status(400).send('Invalid action. Use "add" or "remove".');
        }
    } catch (err) {
        console.error('Error handling admin user request:', err.message);
        res.status(500).send('Internal server error.');
    }
});

// Route to list admin users
app.get('/admins', async (req, res) => {
    try {
        const result = await client.query('SELECT user_id FROM admin_users');  // Adjust query based on your database schema
        const admins = result.rows.map(row => row.user_id);
        res.json(admins);
    } catch (err) {
        console.error('Error fetching admins:', err.message);
        res.status(500).send('Error fetching admins.');
    }
});


app.get('/api/products', (req, res) => {
    console.log('Received request for products');

    // Define the SQL query
    const query = 'SELECT * FROM products';
    console.log('Executing query:', query);

    // Execute the SQL query
    client.query(query, (err, result) => {
        if (err) {
            console.error('Error retrieving products:', err.message);
            return res.status(500).send('Error retrieving products.');
        }

        // Retrieve rows from the query result
        let rows = result.rows;

        // Log the number of rows retrieved
        console.log('Query executed successfully. Number of rows retrieved:', rows.length);

        // Log the raw rows data
        console.log('Raw rows data:', rows);

        // Convert BLOB image data to Base64
        rows = rows.map(row => {
            if (row.product_image) {
                row.product_image = `data:image/png;base64,${Buffer.from(row.product_image).toString('base64')}`;
            } else {
                row.product_image = ''; // or null
                console.log('Product image data is missing for row:', row);
            }
            return row;
        });

        // Send response
        res.json({ products: rows });
    });
});
// Route to check if a user exists and create a wallet if not
app.post('/api/check-user', async (req, res) => {
    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).send('User ID is required.');
    }

    try {
        const result = await client.query('SELECT * FROM users WHERE user_id = $1', [user_id]);
        const row = result.rows[0];

        if (row) {
            res.json({ exists: true, walletAddress: row.wallet_address });
        } else {
            try {
                const walletAddress = await createWalletAddress(user_id);

                await client.query('INSERT INTO users (user_id, wallet_address) VALUES ($1, $2)', [user_id, walletAddress]);

                res.json({ exists: false, walletAddress });
            } catch (error) {
                console.error('Error creating wallet address:', error.message);
                res.status(500).send('Error creating wallet address.');
            }
        }
    } catch (error) {
        console.error('Error handling request:', error.message);
        res.status(500).send('Internal server error.');
    }
});

// Route to handle new transactions
app.post('/api/transactions', async (req, res) => {
    const { productName, productPrice, productId, user, crypto, lat, lng } = req.body;
    console.log(productName, productPrice, productId, user, crypto, lat, lng )

    if (!productName || !productPrice || !productId || !user || !crypto || !lat || !lng) {
        console.error('Missing required fields.');
        return res.status(400).send('Product name, price, and ID are required.');
    }

    try {
        await client.query(`
        INSERT INTO transactions (product_name, product_price, product_id, status, user_id, amount_in_dash, lat, lng)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [productName, productPrice, productId, 'ON', user, crypto, lat, lng]);

        res.send('Transaction successfully recorded.');
    } catch (err) {
        console.error('Error saving transaction:', err.message);
        res.status(500).send('Error saving transaction.');
    }
});

// Route to handle form submissions
app.post('/submit-product', upload.fields([{ name: 'image' }, { name: 'locationimage' }]), async (req, res) => {
    const { latitude, longitude, weight, price, name, type, location, identifier } = req.body;
    const product_image = req.files['image'][0]?.buffer;
    const location_image = req.files['locationimage'][0]?.buffer;

    if (!product_image || !location_image) {
        return res.status(400).send('Both images are required.');
    }

    try {
        // Compress images using sharp
        const compressedProductImage = await sharp(product_image)
            .resize(800) // Resize if needed (optional)
            .jpeg({ quality: 40 }) // Compress and set quality (adjust as needed)
            .toBuffer();

        const compressedLocationImage = await sharp(location_image)
            .resize(800) // Resize if needed (optional)
            .jpeg({ quality: 40 }) // Compress and set quality (adjust as needed)
            .toBuffer();

        await client.query(`
            INSERT INTO products (latitude, longitude, weight, price, name, type, location, identifier, product_image, location_image)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [latitude, longitude, weight, price, name, type, location, identifier, compressedProductImage, compressedLocationImage]);

        res.send('Product successfully uploaded.');
    } catch (err) {
        console.error('Error processing or inserting data:', err.message);
        res.status(500).send('Error saving product.');
    }
});

// Route to retrieve all transactions for a user
app.post('/api/orders', async (req, res) => {
    console.log("POST /api/orders endpoint hit"); // Add this line
    const { userId } = req.body;
    
    
    if (!userId) {
        return res.status(400).send('User ID is required.');
    }

    try {
        const result = await client.query('SELECT * FROM transactions WHERE user_id = $1', [userId]);
        const rows = result.rows;

        if (rows.length > 0) {
            res.json(rows);
        } else {
            res.status(404).send('No transactions found for this user.');
        }
    } catch (err) {
        console.error('Error retrieving transactions:', err.message);
        res.status(500).send('Error retrieving transactions.');
    }
});



// Route to delete a transaction
app.post('/api/deleteTransaction', async (req, res) => {
    const { productId } = req.body;

    if (!productId) {
        return res.status(400).send('Product ID is required.');
    }

    try {
        const result = await client.query('DELETE FROM transactions WHERE product_id = $1 RETURNING *', [productId]);

        if (result.rowCount > 0) {
            res.send('Transaction deleted successfully.');
        } else {
            res.status(404).send('Transaction not found.');
        }
    } catch (err) {
        console.error('Error deleting transaction:', err.message);
        res.status(500).send('Error deleting transaction.');
    }
});

// Route to delete a product
app.delete('/product/:identifier', async (req, res) => {
    const identifier = req.params.identifier;

    try {
        const result = await client.query('DELETE FROM products WHERE identifier = $1 RETURNING *', [identifier]);

        if (result.rowCount > 0) {
            res.send('Product successfully deleted.');
        } else {
            res.status(404).send('Product not found.');
        }
    } catch (err) {
        console.error('Error deleting product:', err.message);
        res.status(500).send('Error deleting product.');
    }
});

// Route to retrieve product details
app.get('/product/:identifier', async (req, res) => {
    const identifier = req.params.identifier;

    try {
        const result = await client.query('SELECT * FROM products WHERE identifier = $1', [identifier]);
        const row = result.rows[0];

        if (row) {
            const productDetails = {
                identifier: row.identifier,
                name: row.name,
                price: row.price,
                weight: row.weight,
                type: row.type,
                latitude: row.latitude,
                longitude: row.longitude,
                location: row.location
            };
            res.json(productDetails);
        } else {
            res.status(404).send('Product not found.');
        }
    } catch (err) {
        console.error('Error retrieving product:', err.message);
        res.status(500).send('Error retrieving product.');
    }
});


app.post('/webhook', (req, res) => {
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Error parsing form:', err);
            res.status(400).send('Error parsing form');
            return;
        }

        // Extract form data
        const address_label = Array.isArray(fields.address_label) ? fields.address_label[0] : fields.address_label;
        const amount = fields.amount;

        console.log('Received address_label:', address_label);
        console.log('Received amount:', amount);

        const trimmedAddressLabel = address_label;
        const amountInFloat = parseFloat(amount);

        try {
            // Query the database for all transactions
            const allTransactions = await client.query('SELECT * FROM transactions');
            console.log('All transactions in the database:');
            allTransactions.rows.forEach((transaction, index) => {
                console.log(`Transaction ${index + 1}:`, transaction);
            });

            // Query for specific transactions for the given user
            const result = await client.query(
                'SELECT amount_in_dash, product_id FROM transactions WHERE user_id = $1',
                [trimmedAddressLabel]
            );

            if (result.rows.length > 0) {
                const amountInDash = result.rows[0].amount_in_dash;
                const productId = result.rows[0].product_id;

                console.log('Amount in dash from database:', amountInDash);

                const acceptableDifference = 1; // $1 tolerance
                if (amountInFloat >= amountInDash - acceptableDifference) {
                    console.log('Transaction valid.');

                    // Delete the transaction from the database
                    await client.query('DELETE FROM transactions WHERE product_id = $1', [productId]);
                    console.log('Transaction deleted successfully.');

                    // Fetch product information for sending to user
                    const productResult = await client.query(
                        'SELECT location_image, latitude, longitude FROM products WHERE identifier = $1',
                        [productId]
                    );

                    if (productResult.rows.length > 0) {
                        const row = productResult.rows[0];

                        // Handle latitude and longitude, ensuring they are treated as strings
                        const latitude = (row.latitude !== null && row.latitude !== undefined ? row.latitude.toString() : '').trim();
                        const longitude = (row.longitude !== null && row.longitude !== undefined ? row.longitude.toString() : '').trim();

                        console.log('Latitude:', latitude);
                        console.log('Longitude:', longitude);

                        if (row.location_image) {
                            // Save the image as a JPG file
                            const imageFilePath = path.join(__dirname, 'location_image.jpg');
                            fs.writeFileSync(imageFilePath, row.location_image);
                            console.log('Location image saved successfully.');

                            // Example code for sending the image to a user
                            // Replace this with actual logic to send the image through your messaging service
                            bot.telegram.sendPhoto(trimmedAddressLabel, { source: imageFilePath }, {
                                caption: `Product Location\nLatitude: ${latitude}\nLongitude: ${longitude}`
                            }).then(() => {
                                console.log('Product information sent successfully.');
                            }).catch((err) => {
                                console.error('Error sending product information:', err.message);
                            });
                        } else {
                            console.log('No location image found for product ID:', productId);
                        }

                        // Optionally, send the location details or image to the user
                        res.send('Webhook processed successfully.');
                    } else {
                        res.status(404).send('Product not found.');
                    }
                } else {
                    console.log('Transaction amount not within acceptable range.');
                    res.status(400).send('Invalid transaction amount.');
                }
            } else {
                res.status(404).send('No transaction found for this user.');
            }
        } catch (err) {
            console.error('Error processing webhook:', err.message);
            res.status(500).send('Error processing webhook.');
        }
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

