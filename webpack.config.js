const webpack = require("webpack");
const path = require('path');
const CompressionPlugin = require('compression-webpack-plugin');

const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
	entry: './src/index.js',
	output: {
		filename: 'main.js',
		path: path.resolve(__dirname, 'dist'),
	},
	plugins: [
		new MiniCssExtractPlugin({
			filename: '[name].css',
			chunkFilename: '[id].css'
		}),
		new webpack.IgnorePlugin(/^fs$/)
		//new CompressionPlugin()
	],
	module: {
		rules: [
			{
				test: /\.module\.s(a|c)ss$/,
				loader: [
					MiniCssExtractPlugin.loader,
					'css-loader',
					{
						loader: 'css-loader',
						options: {
							modules: true,
						}
					},
					{
						loader: 'sass-loader',
						options: {
						}
					}
				]
			},
			{
				test: /\.s(a|c)ss$/,
				exclude: /\.module.(s(a|c)ss)$/,
				loader: [
					MiniCssExtractPlugin.loader,
					'css-loader',
					{
						loader: 'sass-loader',
						options: {
						}
					}
				]
			}
		]
	},
	resolve: {
		extensions: ['.js', '.jsx', '.scss']
	}
};
