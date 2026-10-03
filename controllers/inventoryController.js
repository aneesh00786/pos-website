const db = require('../config/db');

module.exports = {
  // Get all products / Search / Filter directly from MySQL product_variation
  getProducts: async (req, res) => {
    try {
      const companyId = req.session?.user?.company_id || req.query.company_id || 1;
      const { search, category, barcode } = req.query;

      let sql = `
        SELECT 
          pv.id,
          pv.product_id,
          pv.product_code AS sku,
          pv.brandname,
          pv.product_name AS name,
          pv.variation_id,
          pv.variation_name,
          pv.barcode,
          CAST(COALESCE(NULLIF(pv.sell_price, 0), pv.price, 0) AS DECIMAL(10,2)) AS price,
          CAST(COALESCE(pv.stock, 0) AS SIGNED) AS stock_qty,
          CAST(COALESCE(pv.lowstock, 10) AS SIGNED) AS low_stock_threshold,
          CAST(COALESCE(pv.tax, 10) AS DECIMAL(5,2)) AS tax_rate,
          COALESCE(c.category, 'General') AS category,
          pv.image_url AS image
        FROM product_variation pv
        LEFT JOIN categories c ON pv.catId = c.cid
        WHERE pv.company_id = ?
      `;
      const params = [companyId];

      if (barcode) {
        sql += ` AND pv.barcode = ?`;
        params.push(barcode.trim());
      }

      if (category && category !== 'All') {
        sql += ` AND LOWER(c.category) = ?`;
        params.push(category.toLowerCase().trim());
      }

      if (search && search.trim()) {
        const q = `%${search.trim().toLowerCase()}%`;
        sql += ` AND (LOWER(pv.product_name) LIKE ? OR LOWER(pv.product_code) LIKE ? OR pv.barcode LIKE ?)`;
        params.push(q, q, q);
      }

      sql += ` ORDER BY pv.id DESC LIMIT 200`;

      let list = await db.query(sql, params);

      // Get distinct categories for this company
      const catRows = await db.query('SELECT DISTINCT category FROM categories WHERE company_id = ? AND category IS NOT NULL', [companyId]);
      const categories = ['All', ...catRows.map(c => c.category).filter(Boolean)];

      return res.json({
        status: true,
        total: list.length,
        categories: categories,
        data: list
      });
    } catch (err) {
      console.error('[inventoryController getProducts error]:', err);
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  // Lookup single product by barcode (direct scan)
  lookupBarcode: async (req, res) => {
    try {
      const companyId = req.session?.user?.company_id || req.query.company_id || 1;
      const { code } = req.params;
      const cleanCode = code ? code.trim() : '';

      const rows = await db.query(`
        SELECT 
          pv.id,
          pv.product_id,
          pv.product_code AS sku,
          pv.product_name AS name,
          pv.barcode,
          CAST(COALESCE(NULLIF(pv.sell_price, 0), pv.price, 0) AS DECIMAL(10,2)) AS price,
          CAST(COALESCE(pv.stock, 0) AS SIGNED) AS stock_qty,
          CAST(COALESCE(pv.tax, 10) AS DECIMAL(5,2)) AS tax_rate,
          COALESCE(c.category, 'General') AS category,
          pv.image_url AS image
        FROM product_variation pv
        LEFT JOIN categories c ON pv.catId = c.cid
        WHERE pv.company_id = ?
          AND (pv.barcode = ? OR LOWER(pv.product_code) = ?)
        LIMIT 1
      `, [companyId, cleanCode, cleanCode.toLowerCase()]);

      if (rows.length === 0) {
        return res.status(404).json({ status: false, message: "Barcode not recognized" });
      }

      return res.json({ status: true, data: rows[0] });
    } catch (err) {
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  // Stock adjustment in MySQL
  adjustStock: async (req, res) => {
    try {
      const companyId = req.session?.user?.company_id || 1;
      const { product_id, adjustment_type, quantity } = req.body;
      const qty = parseInt(quantity, 10) || 0;

      if (adjustment_type === 'add') {
        await db.query('UPDATE product_variation SET stock = stock + ? WHERE id = ? AND company_id = ?', [qty, product_id, companyId]);
      } else if (adjustment_type === 'subtract') {
        await db.query('UPDATE product_variation SET stock = GREATEST(0, stock - ?) WHERE id = ? AND company_id = ?', [qty, product_id, companyId]);
      } else if (adjustment_type === 'set') {
        await db.query('UPDATE product_variation SET stock = ? WHERE id = ? AND company_id = ?', [qty, product_id, companyId]);
      }

      const rows = await db.query('SELECT id, product_name AS name, stock AS stock_qty FROM product_variation WHERE id = ? AND company_id = ?', [product_id, companyId]);
      return res.json({ status: true, message: "Stock updated successfully in database", data: rows[0] });
    } catch (err) {
      return res.status(500).json({ status: false, message: err.message });
    }
  }
};
