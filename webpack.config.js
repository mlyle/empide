const webpack = require("webpack");
const path = require('path');
const CompressionPlugin = require('compression-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
	entry: './src/index.js',
	output: {
		filename: 'main.js',
		path: path.resolve(__dirname, 'dist'),
	},
	plugins: [
		new CopyPlugin({
			patterns: [
				'src/index.html',
				'src/mpedit.svg',
				'src/defaultpackages.zip'
			]
		})
	],
	devServer: {
		static: './dist',
	},
	module: {
		rules: [
			{
				test: /\.css$/,
				use: [
					'style-loader',
					'css-loader'
				],
			},
			{
				test: /\.s[ac]ss$/i,
				use: [
					// Creates `style` nodes from JS strings
					"style-loader",
					// Translates CSS into CommonJS
					"css-loader",
					// Compiles Sass to CSS
					"sass-loader",
				],
			},
		]
	},
	resolve: {
		extensions: ['.js', '.jsx', '.scss']
	}
};
