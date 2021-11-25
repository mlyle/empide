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
				'node_modules/micropython/lib/firmware.wasm',
				'src/index.html',
				'src/mpedit.svg',
				'src/defaultpackages.zip'
			]
		}),
		new webpack.IgnorePlugin(/^fs$/),
	],
	devServer: {
		contentBase: './dist',
	},
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
			},
			{
				test: /\.css$/,
				use: [
					'style-loader',
					'css-loader'
				],
			},
			{
				test: /\.(woff|woff2|eot|ttf|otf)$/,
				use: [
					'file-loader',
				],
			}
		]
	},
	resolve: {
		extensions: ['.js', '.jsx', '.scss']
	}
};
